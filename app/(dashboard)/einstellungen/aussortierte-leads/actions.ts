"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export interface ArchivedLead {
  id: string;
  company_name: string;
  domain: string | null;
  city: string | null;
  vertical: "recruiting" | "webdesign" | null;
  crm_status_id: string;
  crm_status_label: string;
  crm_status_color: string;
  updated_at: string;
}

export interface ArchivedLeadsResult {
  leads: ArchivedLead[];
  archivedStatusIds: string[];
  manualReviewIds: { recruiting: string | null; webdesign: string | null };
}

export async function listArchivedLeads(): Promise<ArchivedLeadsResult> {
  const user = await requireUser();
  if (!user) return { leads: [], archivedStatusIds: [], manualReviewIds: { recruiting: null, webdesign: null } };
  const db = createServiceClient();

  const { data: statusRows } = await db
    .from("custom_lead_statuses")
    .select("id, label, color, is_archived")
    .order("display_order", { ascending: true });

  const archivedStatuses = (statusRows ?? []).filter((s) => (s as { is_archived: boolean }).is_archived);
  const archivedStatusIds = archivedStatuses.map((s) => s.id as string);
  const labelById = new Map(archivedStatuses.map((s) => [s.id as string, s.label as string]));
  const colorById = new Map(archivedStatuses.map((s) => [s.id as string, (s.color as string) || "#6b7280"]));

  // Wiederherstellungs-Ziele bestimmen (existieren nur, wenn Migration 048 lief).
  const allIds = new Set((statusRows ?? []).map((s) => s.id as string));
  const manualReviewIds = {
    recruiting: allIds.has("recruiting-manuelle-ueberpruefung") ? "recruiting-manuelle-ueberpruefung" : null,
    webdesign: allIds.has("webdesign-manuelle-ueberpruefung") ? "webdesign-manuelle-ueberpruefung" : null,
  };

  if (archivedStatusIds.length === 0) {
    return { leads: [], archivedStatusIds, manualReviewIds };
  }

  const { data: leads } = await db
    .from("leads")
    .select("id, company_name, domain, city, vertical, crm_status_id, updated_at")
    .is("deleted_at", null)
    .in("crm_status_id", archivedStatusIds)
    .order("updated_at", { ascending: false })
    .limit(1000);

  const rows: ArchivedLead[] = (leads ?? []).map((l) => ({
    id: l.id as string,
    company_name: (l.company_name as string) ?? "—",
    domain: (l.domain as string | null) ?? null,
    city: (l.city as string | null) ?? null,
    vertical: (l.vertical as "recruiting" | "webdesign" | null) ?? null,
    crm_status_id: l.crm_status_id as string,
    crm_status_label: labelById.get(l.crm_status_id as string) ?? "—",
    crm_status_color: colorById.get(l.crm_status_id as string) ?? "#6b7280",
    updated_at: l.updated_at as string,
  }));

  return { leads: rows, archivedStatusIds, manualReviewIds };
}

export async function restoreArchivedLead(
  leadId: string,
): Promise<{ success: true; restoredTo: string | null } | { error: string }> {
  const user = await requireUser();
  if (!user) return { error: "Nicht angemeldet." };
  const db = createServiceClient();

  const { data: lead } = await db
    .from("leads")
    .select("vertical")
    .eq("id", leadId)
    .single();
  if (!lead) return { error: "Lead nicht gefunden." };

  // Ziel-Status: Manuelle Ueberpruefung der jeweiligen Vertikale, sonst null
  // (= Lead landet zurueck unter „Neue Leads", da crm_status_id leer ist).
  const { data: statuses } = await db
    .from("custom_lead_statuses")
    .select("id");
  const ids = new Set((statuses ?? []).map((s) => s.id as string));

  let target: string | null = null;
  const vertical = lead.vertical as "recruiting" | "webdesign" | null;
  if (vertical === "webdesign" && ids.has("webdesign-manuelle-ueberpruefung")) {
    target = "webdesign-manuelle-ueberpruefung";
  } else if (ids.has("recruiting-manuelle-ueberpruefung")) {
    target = "recruiting-manuelle-ueberpruefung";
  }

  const { error } = await db
    .from("leads")
    .update({ crm_status_id: target, updated_at: new Date().toISOString() })
    .eq("id", leadId);
  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    action: "lead.archive_restored",
    entityType: "lead",
    entityId: leadId,
    details: { restored_to: target },
  });

  revalidatePath("/einstellungen/aussortierte-leads");
  revalidatePath("/leads");
  revalidatePath("/crm");
  return { success: true, restoredTo: target };
}
