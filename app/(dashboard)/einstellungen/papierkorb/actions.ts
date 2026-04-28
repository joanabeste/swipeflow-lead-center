"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export interface TrashedLead {
  id: string;
  company_name: string;
  domain: string | null;
  city: string | null;
  deleted_at: string;
  expires_at: string;
}

export interface TrashedDeal {
  id: string;
  title: string;
  company_name: string;
  amount_cents: number;
  currency: string;
  stage_label: string | null;
  deleted_at: string;
  expires_at: string;
}

function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 86400_000).toISOString();
}

export async function listTrash(): Promise<{ leads: TrashedLead[]; deals: TrashedDeal[] }> {
  const user = await requireUser();
  if (!user) return { leads: [], deals: [] };
  const db = createServiceClient();

  const [{ data: leads }, { data: deals }] = await Promise.all([
    db
      .from("leads")
      .select("id, company_name, domain, city, deleted_at")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .limit(500),
    db
      .from("deals")
      .select("id, title, company_name, amount_cents, currency, deleted_at, stage_id, deal_stages(label)")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .limit(500),
  ]);

  const leadRows: TrashedLead[] = (leads ?? []).map((l) => ({
    id: l.id as string,
    company_name: (l.company_name as string) ?? "—",
    domain: (l.domain as string | null) ?? null,
    city: (l.city as string | null) ?? null,
    deleted_at: l.deleted_at as string,
    expires_at: addDays(l.deleted_at as string, 30),
  }));

  const dealRows: TrashedDeal[] = (deals ?? []).map((d) => {
    const stageJoin = d.deal_stages as { label: string } | { label: string }[] | null;
    const stageLabel = Array.isArray(stageJoin) ? stageJoin[0]?.label ?? null : stageJoin?.label ?? null;
    return {
      id: d.id as string,
      title: (d.title as string) ?? "—",
      company_name: (d.company_name as string) ?? "—",
      amount_cents: (d.amount_cents as number) ?? 0,
      currency: (d.currency as string) ?? "EUR",
      stage_label: stageLabel,
      deleted_at: d.deleted_at as string,
      expires_at: addDays(d.deleted_at as string, 30),
    };
  });

  return { leads: leadRows, deals: dealRows };
}

export async function restoreLead(leadId: string): Promise<{ success: true } | { error: string }> {
  const user = await requireUser();
  if (!user) return { error: "Nicht angemeldet." };
  const db = createServiceClient();
  const { error } = await db.from("leads").update({ deleted_at: null }).eq("id", leadId);
  if (error) return { error: error.message };
  await logAudit({
    userId: user.id,
    action: "lead.restored",
    entityType: "lead",
    entityId: leadId,
  });
  revalidatePath("/einstellungen/papierkorb");
  revalidatePath("/leads");
  revalidatePath("/crm");
  return { success: true };
}

export async function restoreDeal(dealId: string): Promise<{ success: true } | { error: string }> {
  const user = await requireUser();
  if (!user) return { error: "Nicht angemeldet." };
  const db = createServiceClient();
  const { error } = await db.from("deals").update({ deleted_at: null }).eq("id", dealId);
  if (error) return { error: error.message };
  await logAudit({
    userId: user.id,
    action: "deal.restored",
    entityType: "deal",
    entityId: dealId,
  });
  revalidatePath("/einstellungen/papierkorb");
  revalidatePath("/deals");
  return { success: true };
}

export async function purgeLead(leadId: string): Promise<{ success: true } | { error: string }> {
  const user = await requireUser();
  if (!user) return { error: "Nicht angemeldet." };
  const db = createServiceClient();
  // Nur endgültig löschen, wenn tatsächlich im Papierkorb.
  const { error } = await db
    .from("leads")
    .delete()
    .eq("id", leadId)
    .not("deleted_at", "is", null);
  if (error) return { error: error.message };
  await logAudit({
    userId: user.id,
    action: "lead.purged",
    entityType: "lead",
    entityId: leadId,
  });
  revalidatePath("/einstellungen/papierkorb");
  return { success: true };
}

export async function purgeDeal(dealId: string): Promise<{ success: true } | { error: string }> {
  const user = await requireUser();
  if (!user) return { error: "Nicht angemeldet." };
  const db = createServiceClient();
  const { error } = await db
    .from("deals")
    .delete()
    .eq("id", dealId)
    .not("deleted_at", "is", null);
  if (error) return { error: error.message };
  await logAudit({
    userId: user.id,
    action: "deal.purged",
    entityType: "deal",
    entityId: dealId,
  });
  revalidatePath("/einstellungen/papierkorb");
  return { success: true };
}

// ─── Bulk-Actions ─────────────────────────────────────────────

export async function bulkRestoreLeads(ids: string[]): Promise<{ success: true; count: number } | { error: string }> {
  const user = await requireUser();
  if (!user) return { error: "Nicht angemeldet." };
  if (ids.length === 0) return { success: true, count: 0 };
  const db = createServiceClient();
  const { error } = await db.from("leads").update({ deleted_at: null }).in("id", ids);
  if (error) return { error: error.message };
  await logAudit({
    userId: user.id,
    action: "lead.bulk_restored",
    entityType: "lead",
    details: { lead_count: ids.length },
  });
  revalidatePath("/einstellungen/papierkorb");
  revalidatePath("/leads");
  revalidatePath("/crm");
  return { success: true, count: ids.length };
}

export async function bulkRestoreDeals(ids: string[]): Promise<{ success: true; count: number } | { error: string }> {
  const user = await requireUser();
  if (!user) return { error: "Nicht angemeldet." };
  if (ids.length === 0) return { success: true, count: 0 };
  const db = createServiceClient();
  const { error } = await db.from("deals").update({ deleted_at: null }).in("id", ids);
  if (error) return { error: error.message };
  await logAudit({
    userId: user.id,
    action: "deal.bulk_restored",
    entityType: "deal",
    details: { deal_count: ids.length },
  });
  revalidatePath("/einstellungen/papierkorb");
  revalidatePath("/deals");
  return { success: true, count: ids.length };
}

export async function bulkPurgeLeads(ids: string[]): Promise<{ success: true; count: number } | { error: string }> {
  const user = await requireUser();
  if (!user) return { error: "Nicht angemeldet." };
  if (ids.length === 0) return { success: true, count: 0 };
  const db = createServiceClient();
  const { error } = await db
    .from("leads")
    .delete()
    .in("id", ids)
    .not("deleted_at", "is", null);
  if (error) return { error: error.message };
  await logAudit({
    userId: user.id,
    action: "lead.bulk_purged",
    entityType: "lead",
    details: { lead_count: ids.length },
  });
  revalidatePath("/einstellungen/papierkorb");
  return { success: true, count: ids.length };
}

export async function bulkPurgeDeals(ids: string[]): Promise<{ success: true; count: number } | { error: string }> {
  const user = await requireUser();
  if (!user) return { error: "Nicht angemeldet." };
  if (ids.length === 0) return { success: true, count: 0 };
  const db = createServiceClient();
  const { error } = await db
    .from("deals")
    .delete()
    .in("id", ids)
    .not("deleted_at", "is", null);
  if (error) return { error: error.message };
  await logAudit({
    userId: user.id,
    action: "deal.bulk_purged",
    entityType: "deal",
    details: { deal_count: ids.length },
  });
  revalidatePath("/einstellungen/papierkorb");
  return { success: true, count: ids.length };
}

// ─── Aussortieren aus dem Papierkorb ──────────────────────────
// Holt den Lead aus deleted_at und schreibt einen aussortier-CRM-Status
// (recruiting-passt-nicht / webdesign-passt-nicht). Vertikale aus lead.vertical,
// Fallback Recruiting. FK-validiert: existiert der Status nicht (Migration 049
// nicht gelaufen), wird crm_status_id auf NULL gesetzt — Lead landet dann unter
// "Neue Leads" und kann manuell weiterbehandelt werden.

async function pickArchiveStatusId(
  db: ReturnType<typeof createServiceClient>,
  vertical: string | null,
): Promise<string | null> {
  const target = vertical === "webdesign" ? "webdesign-passt-nicht" : "recruiting-passt-nicht";
  const { data } = await db.from("custom_lead_statuses").select("id").eq("id", target).maybeSingle();
  return data ? target : null;
}

export async function archiveTrashedLead(leadId: string): Promise<{ success: true; statusId: string | null } | { error: string }> {
  const user = await requireUser();
  if (!user) return { error: "Nicht angemeldet." };
  const db = createServiceClient();

  const { data: lead } = await db
    .from("leads")
    .select("vertical")
    .eq("id", leadId)
    .not("deleted_at", "is", null)
    .maybeSingle();
  if (!lead) return { error: "Lead nicht im Papierkorb gefunden." };

  const statusId = await pickArchiveStatusId(db, lead.vertical as string | null);

  const { error } = await db
    .from("leads")
    .update({ deleted_at: null, crm_status_id: statusId, updated_at: new Date().toISOString() })
    .eq("id", leadId);
  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    action: "lead.trash_archived",
    entityType: "lead",
    entityId: leadId,
    details: { crm_status_id: statusId },
  });

  revalidatePath("/einstellungen/papierkorb");
  revalidatePath("/einstellungen/aussortierte-leads");
  revalidatePath("/leads");
  revalidatePath("/crm");
  return { success: true, statusId };
}

export async function bulkArchiveTrashedLeads(ids: string[]): Promise<{ success: true; count: number } | { error: string }> {
  const user = await requireUser();
  if (!user) return { error: "Nicht angemeldet." };
  if (ids.length === 0) return { success: true, count: 0 };
  const db = createServiceClient();

  // Vertikale pro Lead lesen, in zwei Buckets sortieren — pro Bucket ein Update.
  const { data: rows } = await db
    .from("leads")
    .select("id, vertical")
    .in("id", ids)
    .not("deleted_at", "is", null);
  if (!rows || rows.length === 0) return { error: "Keine Leads im Papierkorb." };

  const recruitingId = await pickArchiveStatusId(db, "recruiting");
  const webdesignId = await pickArchiveStatusId(db, "webdesign");

  const recruitingIds: string[] = [];
  const webdesignIds: string[] = [];
  for (const r of rows) {
    if ((r.vertical as string | null) === "webdesign") webdesignIds.push(r.id as string);
    else recruitingIds.push(r.id as string);
  }

  const now = new Date().toISOString();
  if (recruitingIds.length > 0) {
    const { error } = await db
      .from("leads")
      .update({ deleted_at: null, crm_status_id: recruitingId, updated_at: now })
      .in("id", recruitingIds);
    if (error) return { error: error.message };
  }
  if (webdesignIds.length > 0) {
    const { error } = await db
      .from("leads")
      .update({ deleted_at: null, crm_status_id: webdesignId, updated_at: now })
      .in("id", webdesignIds);
    if (error) return { error: error.message };
  }

  await logAudit({
    userId: user.id,
    action: "lead.bulk_trash_archived",
    entityType: "lead",
    details: {
      lead_count: rows.length,
      recruiting_count: recruitingIds.length,
      webdesign_count: webdesignIds.length,
    },
  });

  revalidatePath("/einstellungen/papierkorb");
  revalidatePath("/einstellungen/aussortierte-leads");
  revalidatePath("/leads");
  revalidatePath("/crm");
  return { success: true, count: rows.length };
}
