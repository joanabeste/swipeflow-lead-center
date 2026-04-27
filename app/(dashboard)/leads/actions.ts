"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import type { Lead } from "@/lib/types";

export async function updateLead(
  leadId: string,
  updates: Partial<Lead>,
) {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Alten Stand laden für Change-Tracking
  const { data: oldLead } = await db
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .single();

  if (!oldLead) return { error: "Lead nicht gefunden." };

  // Update durchführen
  const { error } = await db
    .from("leads")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", leadId);

  if (error) return { error: error.message };

  // Änderungen protokollieren
  const changes: { lead_id: string; user_id: string | null; field_name: string; old_value: string | null; new_value: string | null }[] = [];
  for (const [key, newValue] of Object.entries(updates)) {
    const oldValue = oldLead[key as keyof typeof oldLead];
    if (String(oldValue ?? "") !== String(newValue ?? "")) {
      changes.push({
        lead_id: leadId,
        user_id: user?.id ?? null,
        field_name: key,
        old_value: oldValue != null ? String(oldValue) : null,
        new_value: newValue != null ? String(newValue) : null,
      });
    }
  }

  if (changes.length > 0) {
    await db.from("lead_changes").insert(changes);
  }

  await logAudit({
    userId: user?.id ?? null,
    action: "lead.updated",
    entityType: "lead",
    entityId: leadId,
    details: { fields: Object.keys(updates) },
  });

  revalidatePath("/leads");
  return { success: true };
}

export async function deleteLead(leadId: string) {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Soft-Delete: Lead 30 Tage im Papierkorb. Endgültige Löschung übernimmt
  // pg_cron (Migration 040).
  const { error } = await db
    .from("leads")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", leadId);

  if (error) return { error: error.message };

  await logAudit({
    userId: user?.id ?? null,
    action: "lead.trashed",
    entityType: "lead",
    entityId: leadId,
  });

  revalidatePath("/leads");
  revalidatePath("/crm");
  revalidatePath("/einstellungen/papierkorb");
  return { success: true };
}

export async function mergeLeads(keepId: string, mergeId: string) {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: keepLead }, { data: mergeLead }] = await Promise.all([
    db.from("leads").select("*").eq("id", keepId).single(),
    db.from("leads").select("*").eq("id", mergeId).single(),
  ]);

  if (!keepLead || !mergeLead) return { error: "Lead nicht gefunden." };

  // Felder übernehmen die im Haupt-Lead leer sind
  const fieldsToMerge = [
    "domain", "phone", "email", "street", "city", "zip", "state",
    "country", "industry", "company_size", "legal_form", "register_id",
    "website", "career_page_url", "description",
  ];

  const updates: Record<string, unknown> = {};
  for (const field of fieldsToMerge) {
    const keepVal = keepLead[field as keyof typeof keepLead];
    const mergeVal = mergeLead[field as keyof typeof mergeLead];
    if (!keepVal && mergeVal) {
      updates[field] = mergeVal;
    }
  }

  if (Object.keys(updates).length > 0) {
    updates.updated_at = new Date().toISOString();
    await db.from("leads").update(updates).eq("id", keepId);
  }

  // Kontakte und Stellen vom Merge-Lead übernehmen
  await db.from("lead_contacts").update({ lead_id: keepId }).eq("lead_id", mergeId);
  await db.from("lead_job_postings").update({ lead_id: keepId }).eq("lead_id", mergeId);
  await db.from("lead_enrichments").update({ lead_id: keepId }).eq("lead_id", mergeId);
  await db.from("lead_changes").update({ lead_id: keepId }).eq("lead_id", mergeId);

  // Merge-Lead löschen
  await db.from("leads").delete().eq("id", mergeId);

  await logAudit({
    userId: user?.id ?? null,
    action: "lead.merged",
    entityType: "lead",
    entityId: keepId,
    details: { merged_from: mergeId, merged_company: mergeLead.company_name, fields_updated: Object.keys(updates) },
  });

  revalidatePath("/leads");
  revalidatePath(`/leads/${keepId}`);
  return { success: true };
}

export async function findSimilarLeads(leadId: string) {
  const db = createServiceClient();
  const { data: lead } = await db.from("leads").select("company_name, domain, city").eq("id", leadId).single();
  if (!lead) return [];

  // Nach ähnlichem Namen oder gleicher Domain suchen
  const { data: candidates } = await db
    .from("leads")
    .select("id, company_name, domain, city, status")
    .neq("id", leadId)
    .is("deleted_at", null)
    .limit(100);

  if (!candidates) return [];

  const { isFuzzyMatch, isDomainMatch, normalizeDomain } = await import("@/lib/csv/dedup");

  return candidates.filter((c) => {
    if (lead.domain && c.domain && isDomainMatch(normalizeDomain(lead.domain), normalizeDomain(c.domain))) return true;
    if (lead.company_name && c.company_name && isFuzzyMatch(lead.company_name, c.company_name)) return true;
    return false;
  }).slice(0, 10);
}

export async function searchLeads(query: string) {
  if (!query || query.length < 2) return [];

  const db = createServiceClient();
  const q = `%${query}%`;

  const { data } = await db
    .from("leads")
    .select("id, company_name, domain, city, status")
    .is("deleted_at", null)
    .or(`company_name.ilike.${q},domain.ilike.${q},city.ilike.${q},email.ilike.${q},phone.ilike.${q}`)
    .limit(8);

  return data ?? [];
}

export async function saveColumnPreferences(columns: string[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const db = createServiceClient();
  await db
    .from("profiles")
    .update({ lead_table_columns: columns })
    .eq("id", user.id);
}

export async function bulkDeleteLeads(leadIds: string[]) {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await db
    .from("leads")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", leadIds);
  if (error) return { error: error.message };

  await logAudit({
    userId: user?.id ?? null,
    action: "lead.bulk_trashed",
    entityType: "lead",
    details: { lead_count: leadIds.length },
  });

  revalidatePath("/leads");
  revalidatePath("/crm");
  revalidatePath("/einstellungen/papierkorb");
  return { success: true };
}

export async function bulkAddToBlacklist(leadIds: string[]) {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Leads laden
  const { data: leads } = await db.from("leads").select("company_name, domain").in("id", leadIds);
  if (!leads) return { error: "Leads nicht gefunden." };

  let added = 0;
  for (const lead of leads) {
    // Domain blacklisten wenn vorhanden
    if (lead.domain) {
      const { error } = await db.from("blacklist_entries").insert({
        match_type: "domain",
        match_value: lead.domain,
        reason: "Manuell aus Lead-Liste",
        created_by: user?.id,
      });
      if (!error) added++;
    }
    // Firmenname blacklisten
    if (lead.company_name) {
      await db.from("blacklist_entries").insert({
        match_type: "name",
        match_value: lead.company_name,
        reason: "Manuell aus Lead-Liste",
        created_by: user?.id,
      });
    }
  }

  // Leads als filtered markieren
  await db.from("leads").update({
    status: "filtered",
    blacklist_hit: true,
    blacklist_reason: "Manuell auf Blacklist gesetzt",
    updated_at: new Date().toISOString(),
  }).in("id", leadIds);

  await logAudit({
    userId: user?.id ?? null,
    action: "lead.bulk_blacklist",
    entityType: "lead",
    details: { lead_count: leadIds.length, entries_added: added },
  });

  revalidatePath("/leads");
  revalidatePath("/blacklist");
  return { success: true, added };
}

export async function bulkUpdateStatus(
  leadIds: string[],
  status: string,
  crmStatusId?: string | null,
) {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  // crm_status_id wird IMMER explizit ueberschrieben, um FK-Fehler durch
  // alte Trigger/Defaults (z.B. crm_status_id := 'todo') zu vermeiden.
  // Ist der gewuenschte Wert kein gueltiger Status, fallen wir auf NULL zurueck.
  let resolvedCrmStatusId: string | null = crmStatusId ?? null;
  if (resolvedCrmStatusId) {
    const { data: exists } = await db
      .from("custom_lead_statuses")
      .select("id")
      .eq("id", resolvedCrmStatusId)
      .maybeSingle();
    if (!exists) resolvedCrmStatusId = null;
  }

  const payload: Record<string, unknown> = {
    status,
    crm_status_id: resolvedCrmStatusId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await db
    .from("leads")
    .update(payload)
    .in("id", leadIds);

  if (error) return { error: error.message };

  await logAudit({
    userId: user?.id ?? null,
    action: "lead.bulk_status_update",
    entityType: "lead",
    details: {
      lead_count: leadIds.length,
      new_status: status,
      crm_status_id: resolvedCrmStatusId,
    },
  });

  revalidatePath("/leads");
  revalidatePath("/crm");
  return { success: true };
}
