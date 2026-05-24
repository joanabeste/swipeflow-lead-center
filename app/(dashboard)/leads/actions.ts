"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import type { Lead, ServiceMode } from "@/lib/types";
import { ARCHIVE_STATUS_BY_MODE } from "@/lib/service-mode-constants";
import { captureLeadStates, logCancelOverrides } from "@/lib/learning/override-tracker";

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

  // Wenn eine Adress-Komponente geaendert wurde: Koordinaten + geocoded_at
  // zuruecksetzen, damit die naechste Lead-Detail-Anfrage automatisch
  // re-geocodet (siehe ensureLeadCoords-Call in app/(dashboard)/crm/[id]/page.tsx).
  // Sonst zeigt die Standort-Karte den alten Ort.
  const ADDRESS_FIELDS = ["street", "zip", "city", "country"] as const;
  const addressChanged = ADDRESS_FIELDS.some((f) => {
    if (!(f in updates)) return false;
    const oldVal = (oldLead as Record<string, unknown>)[f];
    const newVal = (updates as Record<string, unknown>)[f];
    return String(oldVal ?? "") !== String(newVal ?? "");
  });

  const finalUpdates: Record<string, unknown> = {
    ...updates,
    updated_at: new Date().toISOString(),
  };
  if (addressChanged) {
    finalUpdates.latitude = null;
    finalUpdates.longitude = null;
    finalUpdates.geocoded_at = null;
  }

  // Update durchführen
  const { error } = await db
    .from("leads")
    .update(finalUpdates)
    .eq("id", leadId);

  if (error) return { error: error.message };

  // Override-Tracking: wurde Status manuell aus cancelled/filtered geholt?
  if (typeof updates.status === "string" && updates.status !== oldLead.status) {
    await logCancelOverrides(
      db,
      [{
        id: leadId,
        status: oldLead.status,
        cancel_reason: oldLead.cancel_reason ?? null,
        cancel_reason_code: (oldLead as { cancel_reason_code?: string | null }).cancel_reason_code ?? null,
        cancel_rule_id: oldLead.cancel_rule_id ?? null,
      }],
      updates.status,
      user?.id ?? null,
    );
  }

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
  revalidatePath("/crm");
  revalidatePath(`/crm/${leadId}`);
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
    "website", "phone", "email", "street", "city", "zip", "state",
    "country", "industry", "company_size", "legal_form", "register_id",
    "career_page_url", "description",
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
  const { data: lead } = await db.from("leads").select("company_name, website, city").eq("id", leadId).single();
  if (!lead) return [];

  // Nach ähnlichem Namen oder gleicher Domain suchen
  const { data: candidates } = await db
    .from("leads")
    .select("id, company_name, website, city, status")
    .neq("id", leadId)
    .is("deleted_at", null)
    .limit(100);

  if (!candidates) return [];

  const { isFuzzyMatch, isDomainMatch, normalizeDomain } = await import("@/lib/csv/dedup");

  return candidates.filter((c) => {
    if (lead.website && c.website && isDomainMatch(normalizeDomain(lead.website), normalizeDomain(c.website))) return true;
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
    .select("id, company_name, website, city, status")
    .is("deleted_at", null)
    .or(`company_name.ilike.${q},website.ilike.${q},city.ilike.${q},email.ilike.${q},phone.ilike.${q}`)
    .limit(8);

  return data ?? [];
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
  const { data: leads } = await db.from("leads").select("company_name, website").in("id", leadIds);
  if (!leads) return { error: "Leads nicht gefunden." };

  let added = 0;
  for (const lead of leads) {
    // Domain blacklisten wenn vorhanden (BlacklistMatchType "domain" bleibt
    // als String-Konstante erhalten — referenziert auf Storage-Werte).
    if (lead.website) {
      const { error } = await db.from("blacklist_entries").insert({
        match_type: "domain",
        match_value: lead.website,
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

  // Drei-Zustands-Semantik:
  //   undefined → crm_status_id nicht anfassen (z.B. Setzen-Button im Toolbar)
  //   null      → crm_status_id explizit auf NULL setzen
  //   string    → gegen custom_lead_statuses validieren, Fallback NULL bei ungueltiger ID
  const payload: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  let resolvedCrmStatusId: string | null | undefined = undefined;
  if (crmStatusId !== undefined) {
    resolvedCrmStatusId = crmStatusId;
    if (resolvedCrmStatusId !== null) {
      const { data: exists } = await db
        .from("custom_lead_statuses")
        .select("id")
        .eq("id", resolvedCrmStatusId)
        .maybeSingle();
      if (!exists) resolvedCrmStatusId = null;
    }
    payload.crm_status_id = resolvedCrmStatusId;
  }

  // Lead-Stand VOR dem Update einfrieren — wird gleich fuer Override-Logging
  // benoetigt. Wenn das ueberspringen wir bei Performance-Druck (hier nicht
  // relevant: Bulk-Updates sind selten und liefern uns wertvolles Lernsignal).
  const previousStates = await captureLeadStates(db, leadIds);

  const { error } = await db
    .from("leads")
    .update(payload)
    .in("id", leadIds);

  if (error) return { error: error.message };

  // Override-Log: cancelled/filtered -> aktiv = passives Signal "Cancel war falsch"
  const overrideCount = await logCancelOverrides(
    db,
    previousStates,
    status,
    user?.id ?? null,
  );

  await logAudit({
    userId: user?.id ?? null,
    action: "lead.bulk_status_update",
    entityType: "lead",
    details: {
      lead_count: leadIds.length,
      new_status: status,
      override_count: overrideCount,
      ...(resolvedCrmStatusId !== undefined ? { crm_status_id: resolvedCrmStatusId } : {}),
    },
  });

  revalidatePath("/leads");
  revalidatePath("/crm");
  return { success: true };
}

// Aussortieren / Wiederherstellen aus der Lead-Liste heraus (Bulk + Single).
// Setzt nur crm_status_id; status bleibt unangetastet, damit der Lead in
// /einstellungen/aussortierte-leads landet, ohne den System-Status zu verfaelschen.

export async function bulkArchiveLeads(
  leadIds: string[],
  serviceMode: ServiceMode,
): Promise<{ success: true; previous: { id: string; crm_status_id: string | null }[] } | { error: string }> {
  if (leadIds.length === 0) return { success: true, previous: [] };
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  const targetId = ARCHIVE_STATUS_BY_MODE[serviceMode];

  const { data: exists } = await db
    .from("custom_lead_statuses")
    .select("id")
    .eq("id", targetId)
    .maybeSingle();
  if (!exists) {
    return { error: `Status „${targetId}" existiert nicht — Migration 049 muss in Supabase ausgefuehrt werden.` };
  }

  // Vor-Stand fuer Undo merken
  const { data: before } = await db
    .from("leads")
    .select("id, crm_status_id")
    .in("id", leadIds);

  const { error } = await db
    .from("leads")
    .update({ crm_status_id: targetId, updated_at: new Date().toISOString() })
    .in("id", leadIds);
  if (error) return { error: error.message };

  await logAudit({
    userId: user?.id ?? null,
    action: "lead.bulk_archived",
    entityType: "lead",
    details: { lead_count: leadIds.length, crm_status_id: targetId, service_mode: serviceMode },
  });

  revalidatePath("/leads");
  revalidatePath("/crm");
  revalidatePath("/einstellungen/aussortierte-leads");
  return { success: true, previous: (before ?? []) as { id: string; crm_status_id: string | null }[] };
}

/** Setzt crm_status_id eines oder mehrerer Leads zurueck — nutzt der Undo-Pfad
 *  des Aussortier-Toasts. Akzeptiert pro Lead einen Vorgaenger-Wert (null
 *  erlaubt). FK wird vor dem Schreiben validiert. */
export async function bulkRestoreCrmStatus(
  entries: { id: string; crm_status_id: string | null }[],
): Promise<{ success: true } | { error: string }> {
  if (entries.length === 0) return { success: true };
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Eindeutige Ziel-IDs sammeln und gegen DB validieren.
  const candidateIds = Array.from(
    new Set(entries.map((e) => e.crm_status_id).filter((v): v is string => !!v)),
  );
  let validIds = new Set<string>();
  if (candidateIds.length > 0) {
    const { data } = await db
      .from("custom_lead_statuses")
      .select("id")
      .in("id", candidateIds);
    validIds = new Set((data ?? []).map((r) => r.id as string));
  }

  // Pro Ziel-Wert ein Update — wenige Werte, viele IDs ist der Normalfall.
  const groups = new Map<string | null, string[]>();
  for (const e of entries) {
    const target = e.crm_status_id && validIds.has(e.crm_status_id) ? e.crm_status_id : null;
    const arr = groups.get(target) ?? [];
    arr.push(e.id);
    groups.set(target, arr);
  }

  for (const [target, ids] of groups) {
    const { error } = await db
      .from("leads")
      .update({ crm_status_id: target, updated_at: new Date().toISOString() })
      .in("id", ids);
    if (error) return { error: error.message };
  }

  await logAudit({
    userId: user?.id ?? null,
    action: "lead.bulk_archive_undone",
    entityType: "lead",
    details: { lead_count: entries.length },
  });

  revalidatePath("/leads");
  revalidatePath("/crm");
  revalidatePath("/einstellungen/aussortierte-leads");
  return { success: true };
}
