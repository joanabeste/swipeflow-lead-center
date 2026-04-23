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
