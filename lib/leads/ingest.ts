import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findInternalDuplicates,
  findDbDuplicatesDetailed,
  loadExistingLeadsIndex,
  findDbDuplicateForLead,
  addLeadToIndex,
} from "@/lib/csv/dedup";
import { checkLead } from "@/lib/blacklist/checker";
import { evaluateCancelRules } from "@/lib/cancel-rules/evaluator";
import { getWebdevScoringConfig } from "@/lib/enrichment/webdev-scoring";
import { logAudit } from "@/lib/audit-log";
import {
  loadImportContext,
  finalizeImportLog,
  batchInsert,
  parseContactName,
} from "@/lib/csv/import-helpers";
import type { LeadSourceType, TrafficLightRating } from "@/lib/types";
import { scoreForRating } from "@/lib/types";

export interface IngestResult {
  imported: number;
  skipped: number;
  duplicates: number;
  updated: number;
  archived: number;
  errors: number;
  contacts_imported: number;
  errorDetails: { row: number; field: string; message: string }[];
}

export interface IngestOptions {
  userId: string | null;
  vertical: "webdesign" | "recruiting" | null;
  /**
   * Verhalten bei einem DB-Duplikat:
   *  - "merge": bisheriges CSV-Verhalten — aussortierte Leads bleiben unangetastet,
   *    sonst werden fehlende Felder des bestehenden Leads ergaenzt.
   *  - "skip": externe API — bestehende Leads werden NIE angefasst, nur komplett
   *    neue Firmen werden angelegt.
   */
  onDuplicate: "merge" | "skip";
  /** source_type fuer neu angelegte Leads. Ohne Wert greift der DB-Default ('csv'). */
  sourceType?: LeadSourceType;
}

/**
 * Gemeinsame Lead-Import-Orchestrierung fuer den CSV-Import (Server Action) und die
 * externe Import-API (Route Handler).
 *
 * Erwartet bereits via `normalizeLeadRow` normalisierte Rows sowie eine bestehende
 * `import_logs`-ID — der Aufrufer legt das Log selbst an (beim CSV-Import bleibt so der
 * Original-CSV-Storage-Upload an seiner Position). Alle Leads dieses Aufrufs erhalten
 * `source_import_id = importLogId`, bilden also einen Batch in der Import-Historie.
 *
 * Ablauf: interne + DB-Duplikate finden → Blacklist/Cancel-Rules → Batch-Insert von
 * Leads und Kontakten → finalizeImportLog → Audit-Log.
 */
export async function ingestLeads(
  db: SupabaseClient,
  mappedRows: Record<string, string | null>[],
  importLogId: string,
  opts: IngestOptions,
): Promise<IngestResult> {
  // Interne Duplikate finden
  const internalDups = findInternalDuplicates(mappedRows);

  // DB-Duplikate finden (mit archived-Flag fuer aussortierte Leads).
  const dbDups = await findDbDuplicatesDetailed(db, mappedRows);

  // Blacklist-Regeln, Eintraege und Cancel-Rules in einem Rutsch laden (gecacht fuer gesamten Import)
  const ctx = await loadImportContext(db);

  // Webdesign-Vertikale: Schalter, ob Leads ohne Website akzeptiert werden
  const webdevConfig = opts.vertical === "webdesign" ? await getWebdevScoringConfig() : null;
  const blockMissingWebsite = webdevConfig
    ? webdevConfig.allow_leads_without_website === false
    : false;

  let importedCount = 0;
  let skippedCount = 0;
  let duplicateCount = 0;
  let updatedCount = 0;
  let archivedCount = 0;
  let errorCount = 0;
  const errors: { row: number; field: string; message: string }[] = [];

  // Batch-Insert: 500er Chunks
  const BATCH_SIZE = 500;
  const leadsToInsert: Record<string, unknown>[] = [];
  // Kontakte aus contact_N_name-Slots. Werden NACH erfolgreichem Lead-Batch-Insert
  // in lead_contacts geschrieben.
  const contactsToInsert: { lead_id: string; name: string; role: string | null }[] = [];
  // Kontakte fuer Re-Imports (existierende Leads): dedupliziert per name pro lead_id.
  const contactsForExistingLeads: { lead_id: string; name: string; role: string | null }[] = [];

  const updateFields = [
    "website", "phone", "email", "street", "city", "zip", "state",
    "country", "industry", "company_size", "legal_form", "register_id",
    "description",
  ];

  for (let i = 0; i < mappedRows.length; i++) {
    const row = mappedRows[i];

    // Pflichtfeld pruefen
    if (!row.company_name) {
      errors.push({ row: i + 2, field: "company_name", message: "Firmenname fehlt" });
      errorCount++;
      continue;
    }

    // Internes Duplikat
    if (internalDups.has(i)) {
      duplicateCount++;
      skippedCount++;
      continue;
    }

    // DB-Duplikat
    const dupMatch = dbDups.get(i);
    const existingLeadId = dupMatch?.leadId;
    if (dupMatch && existingLeadId) {
      // Externe API ("skip"): bestehende Leads niemals anfassen — nur neue Firmen anlegen.
      if (opts.onDuplicate === "skip") {
        duplicateCount++;
        skippedCount++;
        continue;
      }
      // "merge": Aussortierte Leads bleiben stabil (KI-Negativ-Signal nicht ueberschreiben).
      if (dupMatch.archived) {
        archivedCount++;
        skippedCount++;
        continue;
      }
      const { data: existingLead } = await db.from("leads").select("*").eq("id", existingLeadId).single();
      if (existingLead) {
        const updates: Record<string, string | null> = {};
        for (const field of updateFields) {
          const newVal = row[field];
          const oldVal = existingLead[field as keyof typeof existingLead] as string | null;
          if (newVal && !oldVal) {
            updates[field] = newVal;
          }
        }
        if (Object.keys(updates).length > 0) {
          updates.updated_at = new Date().toISOString();
          await db.from("leads").update(updates).eq("id", existingLeadId);
          // Change-Tracking
          const changes = Object.entries(updates)
            .filter(([k]) => k !== "updated_at")
            .map(([k, v]) => ({
              lead_id: existingLeadId,
              user_id: opts.userId,
              field_name: k,
              old_value: null,
              new_value: v,
            }));
          if (changes.length > 0) await db.from("lead_changes").insert(changes);
          updatedCount++;
        } else {
          duplicateCount++;
        }
        // Ansprechpartner-Slots auch beim Re-Import auf den existierenden Lead anwenden.
        for (const slot of ["contact_1_name", "contact_2_name", "contact_3_name"] as const) {
          const parsed = parseContactName(row[slot] as string | null | undefined);
          if (!parsed) continue;
          contactsForExistingLeads.push({ lead_id: existingLeadId, name: parsed.name, role: parsed.role });
        }
      }
      continue;
    }

    // Blacklist-Check
    const blacklistResult = checkLead(row, ctx.rules, ctx.entries);

    // Cancel-Rules-Check (Import-Phase)
    const cancelResult = evaluateCancelRules(
      row as unknown as Record<string, unknown>,
      ctx.cancelRules,
      "import",
    );

    let status = "imported";
    let blacklistHit = false;
    let blacklistReason: string | null = null;
    let cancelReason: string | null = null;
    let cancelRuleId: string | null = null;

    if (blacklistResult.blocked) {
      status = "filtered";
      blacklistHit = true;
      blacklistReason = blacklistResult.reasons.join("; ");
    } else if (cancelResult.cancelled) {
      status = "cancelled";
      cancelReason = cancelResult.reasons.map((r) => r.reason).join("; ");
      cancelRuleId = cancelResult.reasons[0].ruleId;
    } else if (blockMissingWebsite && !row.website) {
      status = "cancelled";
      cancelReason = "Webdesign-Import: keine Website";
    }

    // Lead-ID clientseitig vorgenerieren, damit lead_contacts ohne separates
    // Insert-with-Select-Roundtrip referenzieren koennen.
    const leadId = crypto.randomUUID();

    leadsToInsert.push({
      id: leadId,
      company_name: row.company_name,
      website: row.website,
      phone: row.phone,
      // Provenienz: importierte/gescrapte Nummern sind überschreibbar, sobald die
      // Anreicherung eine offizielle Website-Nummer findet (enrich-lead.ts).
      phone_source: row.phone ? "import" : null,
      email: row.email,
      street: row.street,
      city: row.city,
      zip: row.zip,
      state: row.state,
      country: row.country,
      industry: row.industry,
      company_size: row.company_size,
      legal_form: row.legal_form,
      register_id: row.register_id,
      description: row.description,
      vertical: opts.vertical,
      status,
      blacklist_hit: blacklistHit,
      blacklist_reason: blacklistReason,
      cancel_reason: cancelReason,
      cancel_rule_id: cancelRuleId,
      source_import_id: importLogId,
      created_by: opts.userId,
      ...(opts.sourceType ? { source_type: opts.sourceType } : {}),
      ...(row.traffic_light_rating
        ? {
            traffic_light_rating: row.traffic_light_rating,
            traffic_light_score: scoreForRating(row.traffic_light_rating as TrafficLightRating),
            traffic_light_reason: row.traffic_light_reason ?? null,
            traffic_light_rated_at: new Date().toISOString(),
            traffic_light_source: "api",
          }
        : {}),
    });

    // Ansprechpartner-Slots einsammeln (1-3 pro Lead), Dedup innerhalb des Leads.
    const seenNames = new Set<string>();
    for (const slot of ["contact_1_name", "contact_2_name", "contact_3_name"] as const) {
      const parsed = parseContactName(row[slot] as string | null | undefined);
      if (!parsed) continue;
      const key = parsed.name.toLowerCase();
      if (seenNames.has(key)) continue;
      seenNames.add(key);
      contactsToInsert.push({ lead_id: leadId, name: parsed.name, role: parsed.role });
    }

    importedCount++;
  }

  // ── Letzter Dedup-Pass UNMITTELBAR vor dem Insert ──────────────────────────
  // Schliesst zwei Luecken, die zu Dubletten gefuehrt haben:
  //   (1) within-batch — dieselbe Firma mehrfach in EINEM Import (falls
  //       findInternalDuplicates etwas durchlaesst);
  //   (2) Race — ein parallel laufender Import hat zwischenzeitlich Leads
  //       angelegt (der upfront-Snapshot war zu Beginn geladen).
  // Wir laden den Bestand FRISCH (kurzes Race-Fenster) und pruefen jeden
  // geplanten Lead gegen den MITWACHSENDEN Index mit demselben starken Matcher
  // (Domain/E-Mail/Telefon/Name). Treffer -> nicht einfuegen.
  let dedupedLeads = leadsToInsert;
  if (leadsToInsert.length > 0) {
    const freshIndex = await loadExistingLeadsIndex(db);
    const droppedIds = new Set<string>();
    dedupedLeads = [];
    for (const lead of leadsToInsert) {
      const probe = {
        company_name: (lead.company_name as string | null) ?? null,
        website: (lead.website as string | null) ?? null,
        city: (lead.city as string | null) ?? null,
        email: (lead.email as string | null) ?? null,
        phone: (lead.phone as string | null) ?? null,
      };
      if (findDbDuplicateForLead(freshIndex, probe)) {
        droppedIds.add(lead.id as string);
        duplicateCount++;
        importedCount--;
        continue;
      }
      dedupedLeads.push(lead);
      // Frisch geplanten Lead in den Index aufnehmen, damit die naechste Zeile
      // desselben Batches gegen ihn matcht (within-batch).
      addLeadToIndex(freshIndex, {
        id: lead.id as string,
        website: probe.website,
        company_name: probe.company_name,
        city: probe.city,
        crm_status_id: null,
        email: probe.email,
        phone: probe.phone,
        lifecycle_stage: "lead",
        deleted_at: null,
      });
    }
    // Kontakte verwaister (gedroppter) Leads ebenfalls verwerfen.
    if (droppedIds.size > 0) {
      for (let j = contactsToInsert.length - 1; j >= 0; j--) {
        if (droppedIds.has(contactsToInsert[j].lead_id)) contactsToInsert.splice(j, 1);
      }
    }
  }

  // Batch-Inserts mit Fehlersammlung
  const batchResult = await batchInsert(db, "leads", dedupedLeads, BATCH_SIZE);
  if (batchResult.failed > 0) {
    importedCount -= batchResult.failed;
    errorCount += batchResult.failed;
    batchResult.errors.forEach((msg) => errors.push({ row: -1, field: "batch", message: msg }));
  }

  // Kontakt-Insert NACH erfolgreichem Lead-Insert. Erst neue Leads, dann
  // existierende (Re-Import), dort gegen den vorhandenen Bestand dedupliziert.
  let contactsImportedCount = 0;
  if (contactsToInsert.length > 0) {
    const cRes = await batchInsert(db, "lead_contacts", contactsToInsert, BATCH_SIZE);
    contactsImportedCount += cRes.inserted;
    cRes.errors.forEach((msg) => errors.push({ row: -1, field: "lead_contacts", message: msg }));
  }
  if (contactsForExistingLeads.length > 0) {
    // Bestand pro betroffenem Lead laden, dann clientseitig filtern.
    const affectedIds = Array.from(new Set(contactsForExistingLeads.map((c) => c.lead_id)));
    const { data: existingContacts } = await db
      .from("lead_contacts")
      .select("lead_id, name")
      .in("lead_id", affectedIds);
    const seen = new Set<string>();
    for (const c of existingContacts ?? []) {
      seen.add(`${c.lead_id}|${(c.name as string).toLowerCase().trim()}`);
    }
    const filtered: typeof contactsForExistingLeads = [];
    for (const c of contactsForExistingLeads) {
      const key = `${c.lead_id}|${c.name.toLowerCase().trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      filtered.push(c);
    }
    if (filtered.length > 0) {
      const cRes2 = await batchInsert(db, "lead_contacts", filtered, BATCH_SIZE);
      contactsImportedCount += cRes2.inserted;
      cRes2.errors.forEach((msg) => errors.push({ row: -1, field: "lead_contacts", message: msg }));
    }
  }

  // Import-Log abschliessen
  await finalizeImportLog(db, importLogId, {
    imported: importedCount,
    skipped: skippedCount,
    duplicates: duplicateCount,
    updated: updatedCount,
    errors: errorCount,
    errorDetails: errors,
  });

  await logAudit({
    userId: opts.userId,
    action: "import.completed",
    entityType: "import_log",
    entityId: importLogId,
    details: {
      imported: importedCount,
      skipped: skippedCount,
      duplicates: duplicateCount,
      archived: archivedCount,
      errors: errorCount,
      contacts_imported: contactsImportedCount,
    },
  });

  return {
    imported: importedCount,
    skipped: skippedCount,
    duplicates: duplicateCount,
    updated: updatedCount,
    archived: archivedCount,
    errors: errorCount,
    contacts_imported: contactsImportedCount,
    errorDetails: errors,
  };
}
