"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import type { Lead, ServiceMode, TrafficLightRating } from "@/lib/types";
import { scoreForRating } from "@/lib/types";
import { ARCHIVE_STATUS_BY_MODE } from "@/lib/service-mode-constants";
import { captureLeadStates, logCancelOverrides } from "@/lib/learning/override-tracker";
import { checkSection } from "@/lib/auth";
import { insertMergeNote } from "@/lib/leads/merge-note";

// Mass-Assignment-Guard: updateLead wird vom Stammdaten-Formular im CRM mit
// rohem Record<string, ...> aufgerufen. Ohne Whitelist koennte ein Browser-
// User beliebige Spalten setzen (assigned_to, lifecycle_stage, deleted_at,
// blacklist_hit, status, crm_status_id ...). Hier explizit auflisten, welche
// Felder ueber diese Action editierbar sind. Status- und Lifecycle-Wechsel
// laufen ueber dedizierte Actions (bulkUpdateStatus, setTrafficLightManual,
// bulkArchiveLeads). Adress-Felder bleiben drin, damit das Re-Geocoding unten
// triggert.
const ALLOWED_EDIT_FIELDS = [
  "company_name",
  "website",
  "phone",
  "email",
  "street",
  "city",
  "zip",
  "state",
  "country",
  "industry",
  "company_size",
  "legal_form",
  "register_id",
  "career_page_url",
  "description",
  // Manuelle Ampel-Korrektur laeuft ueber setTrafficLightManual → ruft
  // updateLead intern auf. Diese Felder duerfen deshalb hier durch.
  "traffic_light_rating",
  "traffic_light_score",
  "traffic_light_source",
  "traffic_light_rated_at",
] as const;
type AllowedEditField = (typeof ALLOWED_EDIT_FIELDS)[number];

export async function updateLead(
  leadId: string,
  updates: Partial<Lead>,
) {
  // Whitelist anwenden: unbekannte Keys (status, assigned_to, deleted_at, ...)
  // werden hier verworfen, bevor irgendetwas Sicherheitsrelevantes passiert.
  const safe = Object.fromEntries(
    Object.entries(updates).filter(([k]) =>
      (ALLOWED_EDIT_FIELDS as readonly string[]).includes(k),
    ),
  ) as Partial<Record<AllowedEditField, unknown>>;

  // Keine erlaubten Felder uebrig → frueher Erfolg, ohne DB-Call.
  if (Object.keys(safe).length === 0) {
    return { success: true };
  }

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
    if (!(f in safe)) return false;
    const oldVal = (oldLead as Record<string, unknown>)[f];
    const newVal = (safe as Record<string, unknown>)[f];
    return String(oldVal ?? "") !== String(newVal ?? "");
  });

  const finalUpdates: Record<string, unknown> = {
    ...safe,
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

  // Änderungen protokollieren
  const changes: { lead_id: string; user_id: string | null; field_name: string; old_value: string | null; new_value: string | null }[] = [];
  for (const [key, newValue] of Object.entries(safe)) {
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
    details: { fields: Object.keys(safe) },
  });

  revalidatePath("/leads");
  revalidatePath("/crm");
  revalidatePath(`/crm/${leadId}`);
  return { success: true };
}

/**
 * Manuelle Ampel-Korrektur im Lead-Detail. Setzt `source='manual'`, damit ein
 * erneuter Anreicherungs-Lauf die Korrektur nicht überschreibt (Guard in
 * enrich-lead.ts). Nutzt updateLead → Change-Tracking + Audit + Revalidation.
 */
export async function setTrafficLightManual(leadId: string, rating: TrafficLightRating) {
  if (!["green", "amber", "red"].includes(rating)) {
    return { error: "Ungültiger Ampel-Wert." };
  }
  return updateLead(leadId, {
    traffic_light_rating: rating,
    traffic_light_score: scoreForRating(rating),
    traffic_light_source: "manual",
    traffic_light_rated_at: new Date().toISOString(),
  } as Partial<Lead>);
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

/**
 * Sicheres Zusammenführen zweier Leads über die Postgres-Funktion `merge_lead`
 * (Migration 101): haengt ALLE Kind-Daten (Anrufe, Verträge, Deals, Provisionen,
 * Notizen …) per Foreign-Key dynamisch um und ARCHIVIERT den Verlierer
 * (umkehrbar) — statt ihn wie das alte `mergeLeads` hart zu löschen (das konnte
 * an `contracts ON DELETE RESTRICT` scheitern bzw. Daten verlieren).
 *
 * `survivorId` bleibt erhalten (der Lead, den der Nutzer gerade ansieht),
 * `loserId` wird zusammengeführt. Fehler werden im Klartext zurückgegeben —
 * inkl. eindeutigem Hinweis, falls die RPC in der DB fehlt.
 */
export async function mergeDuplicateLead(
  survivorId: string,
  loserId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await checkSection("can_vertrieb");
  if (!ctx) return { error: "Keine Berechtigung zum Zusammenführen." };
  if (!survivorId || !loserId || survivorId === loserId) {
    return { error: "Ungültige Auswahl zum Zusammenführen." };
  }

  const db = createServiceClient();

  // Verlierer-Stammdaten VOR dem Merge lesen — für die Notiz auf dem Survivor.
  const { data: loser } = await db
    .from("leads")
    .select("company_name, website, city")
    .eq("id", loserId)
    .maybeSingle();

  const { error } = await db.rpc("merge_lead", {
    p_survivor: survivorId,
    p_loser: loserId,
  });
  if (error) {
    const missingFn = /could not find the function|pgrst202|merge_lead.* does not exist|schema cache/i.test(
      error.message ?? "",
    );
    return {
      error: missingFn
        ? "Die Datenbank-Funktion „merge_lead“ fehlt — Migration 101 (101_merge_lead_fix.sql) muss in Supabase ausgeführt werden."
        : error.message,
    };
  }

  // Vermerk im Aktivitäten-Feed des behaltenen Leads (best-effort).
  await insertMergeNote(db, survivorId, [loser ?? { company_name: null }]);

  await logAudit({
    userId: ctx.user.id,
    action: "lead.merged",
    entityType: "lead",
    entityId: survivorId,
    details: { survivor: survivorId, loser: loserId, source: "lead-detail" },
  });

  revalidatePath("/leads");
  revalidatePath("/crm");
  revalidatePath(`/crm/${survivorId}`);
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

// Webdesign-Ampel als lesbare Notiz fuer die CRM-Aktivitaeten formatieren.
// whitespace-pre-wrap im Activity-Feed erhaelt den Zeilenumbruch.
const TRAFFIC_LIGHT_NOTE_LABELS: Record<string, string> = {
  green: "🟢 Grün",
  amber: "🟡 Orange",
  red: "🔴 Rot",
};
function formatTrafficLightNote(
  rating: string,
  score: number | null,
  reason: string | null,
): string {
  const label = TRAFFIC_LIGHT_NOTE_LABELS[rating] ?? rating;
  const head = `Webdesign-Ampel: ${label}${score != null ? ` (Score ${score})` : ""}`;
  const body = reason?.trim();
  return body ? `${head}\n${body}` : head;
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

  // Vor dem Update: CRM-Zugehoerigkeit + Ampel-Daten lesen, um beim Uebergang
  // "nicht im CRM -> im CRM" die Webdesign-Ampel-Begruendung als Notiz in den
  // Aktivitaeten zu sichern (Historie bleibt erhalten).
  const { data: priorAmpelRows } = await db
    .from("leads")
    .select("id, status, crm_status_id, traffic_light_rating, traffic_light_score, traffic_light_reason")
    .in("id", leadIds);

  const { error } = await db
    .from("leads")
    .update(payload)
    .in("id", leadIds);

  if (error) return { error: error.message };

  // Ampel-Notiz beim Eintritt ins CRM. Idempotent: nur beim echten Uebergang
  // (vorher nicht im CRM) und nur wenn eine Ampel-Bewertung vorliegt. Best-effort
  // — ein Fehler hier bricht die CRM-Uebernahme nicht ab.
  try {
    const IN_CRM_STATUS = new Set(["qualified", "exported"]);
    const noteRows = (priorAmpelRows ?? [])
      .map((row) => {
        const r = row as {
          id: string;
          status: string | null;
          crm_status_id: string | null;
          traffic_light_rating: string | null;
          traffic_light_score: number | null;
          traffic_light_reason: string | null;
        };
        const wasInCrm = r.crm_status_id != null || IN_CRM_STATUS.has(r.status ?? "");
        const newCrmStatusId =
          resolvedCrmStatusId === undefined ? r.crm_status_id : resolvedCrmStatusId;
        const isInCrm = newCrmStatusId != null || IN_CRM_STATUS.has(status);
        if (wasInCrm || !isInCrm || !r.traffic_light_rating) return null;
        return {
          lead_id: r.id,
          content: formatTrafficLightNote(
            r.traffic_light_rating,
            r.traffic_light_score,
            r.traffic_light_reason,
          ),
          // System-Notiz: created_by=null -> der Aktivitaeten-Feed zeigt "System"
          // statt des handelnden Nutzers (item.author ?? "System").
          created_by: null,
        };
      })
      .filter((n): n is NonNullable<typeof n> => n !== null);
    if (noteRows.length > 0) {
      const { error: noteErr } = await db.from("lead_notes").insert(noteRows);
      if (noteErr) console.error("[bulkUpdateStatus:ampelNote]", noteErr);
    }
  } catch (e) {
    console.error("[bulkUpdateStatus:ampelNote] unerwartet:", e);
  }

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
