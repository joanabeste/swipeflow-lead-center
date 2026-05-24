"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseCSV } from "@/lib/csv/parser";
import { normalizeLeadRow } from "@/lib/csv/normalizer";
import { findInternalDuplicates, findDbDuplicatesDetailed } from "@/lib/csv/dedup";
import { checkLead } from "@/lib/blacklist/checker";
import { evaluateCancelRules } from "@/lib/cancel-rules/evaluator";
import { getWebdevScoringConfig } from "@/lib/enrichment/webdev-scoring";
import { logAudit } from "@/lib/audit-log";
import {
  validateCsvSize,
  sanitizeCellValue,
  loadImportContext,
  createImportLog,
  finalizeImportLog,
  batchInsert,
  parseContactName,
} from "@/lib/csv/import-helpers";

export async function processImport(
  fileContent: string,
  mapping: Record<string, string>,
  delimiter: string,
  templateName?: string,
  vertical: "webdesign" | "recruiting" | null = null,
) {
  const supabase = await createClient();
  const db = createServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // CSV parsen
  const { headers, rows } = parseCSV(fileContent, delimiter);

  // Limit-Check
  const sizeError = validateCsvSize(rows.length);
  if (sizeError) return { error: sizeError.error };

  // Import-Log (wirft bei Fehler — kein silent fail)
  let importLog;
  try {
    importLog = await createImportLog(db, {
      fileName: "csv-import",
      rowCount: rows.length,
      importType: "csv",
      userId: user?.id ?? null,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Import-Log fehlgeschlagen" };
  }

  // Zeilen auf Lead-Feld-Schema mappen + CSV-Injection sanitizen.
  // Mehrere Quellspalten auf "description" werden zu "Header: Wert\nHeader: Wert" verkettet
  // (NorthData liefert z.B. Umsatz, Geschäftsführer, Status, Unternehmensgegenstand alle als description).
  const mappedRows = rows.map((row) => {
    const mapped: Record<string, string | null> = {};
    headers.forEach((header, i) => {
      const targetField = mapping[header];
      if (!targetField || !row[i]) return;
      const value = sanitizeCellValue(row[i]);
      if (!value) return;
      if (targetField === "description") {
        const part = `${header}: ${value}`;
        mapped.description = mapped.description
          ? `${mapped.description}\n${part}`
          : part;
      } else {
        mapped[targetField] = value;
      }
    });
    return normalizeLeadRow(mapped);
  });

  // Interne Duplikate finden
  const internalDups = findInternalDuplicates(mappedRows);

  // DB-Duplikate finden (mit archived-Flag fuer aussortierte Leads).
  const dbDups = await findDbDuplicatesDetailed(db, mappedRows);

  // Blacklist-Regeln, Einträge und Cancel-Rules in einem Rutsch laden (gecacht für gesamten Import)
  const ctx = await loadImportContext(db);

  // Webdesign-Vertikale: Schalter, ob Leads ohne Website akzeptiert werden
  const webdevConfig = vertical === "webdesign" ? await getWebdevScoringConfig() : null;
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
  // Kontakte aus contact_N_name-Slots (z.B. Northdata „Ges. Vertreter").
  // Werden NACH erfolgreichem Lead-Batch-Insert in lead_contacts geschrieben.
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

    // Pflichtfeld prüfen
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

    // DB-Duplikat → Bestehenden Lead aktualisieren statt überspringen
    const dupMatch = dbDups.get(i);
    const existingLeadId = dupMatch?.leadId;
    if (dupMatch && existingLeadId) {
      // Aussortierte Leads: KEIN Update, KEIN Insert — Status „Passt nicht" bleibt stabil,
      // damit das KI-Negativ-Signal nicht versehentlich ueberschrieben wird.
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
              user_id: user?.id ?? null,
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
        // Werden weiter unten gegen die bereits vorhandenen lead_contacts dedupliziert,
        // damit nichts doppelt einfaerbt.
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
      vertical,
      status,
      blacklist_hit: blacklistHit,
      blacklist_reason: blacklistReason,
      cancel_reason: cancelReason,
      cancel_rule_id: cancelRuleId,
      source_import_id: importLog.id,
      created_by: user?.id ?? null,
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

  // Batch-Inserts mit Fehlersammlung
  const batchResult = await batchInsert(db, "leads", leadsToInsert, BATCH_SIZE);
  if (batchResult.failed > 0) {
    importedCount -= batchResult.failed;
    errorCount += batchResult.failed;
    batchResult.errors.forEach((msg) => errors.push({ row: -1, field: "batch", message: msg }));
  }

  // Kontakt-Insert NACH erfolgreichem Lead-Insert. Erst die Kontakte fuer
  // neue Leads, dann die fuer existierende (Re-Import). Bei Re-Import
  // dedupliziert gegen den schon-vorhandenen Bestand, damit nichts doppelt
  // einfaerbt — Dedup per lowercase(name) pro lead_id.
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

  // Import-Log abschließen
  await finalizeImportLog(db, importLog.id, {
    imported: importedCount,
    skipped: skippedCount,
    duplicates: duplicateCount,
    updated: updatedCount,
    errors: errorCount,
    errorDetails: errors,
  });

  // Mapping-Template speichern
  if (templateName) {
    await db.from("mapping_templates").upsert(
      {
        name: templateName,
        mapping,
        delimiter,
        encoding: "utf-8",
        created_by: user?.id ?? null,
      },
      { onConflict: "name" },
    );
  }

  await logAudit({
    userId: user?.id ?? null,
    action: "import.completed",
    entityType: "import_log",
    entityId: importLog.id,
    details: {
      imported: importedCount,
      skipped: skippedCount,
      duplicates: duplicateCount,
      archived: archivedCount,
      errors: errorCount,
      contacts_imported: contactsImportedCount,
    },
  });

  revalidatePath("/leads");
  revalidatePath("/import");
  revalidatePath("/");

  return {
    success: true,
    imported: importedCount,
    skipped: skippedCount,
    duplicates: duplicateCount,
    updated: updatedCount,
    archived: archivedCount,
    errors: errorCount,
    contacts_imported: contactsImportedCount,
  };
}

export async function deleteImport(importId: string) {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Import-Log laden für Audit
  const { data: importLog } = await db
    .from("import_logs")
    .select("file_name, imported_count")
    .eq("id", importId)
    .single();

  if (!importLog) return { error: "Import nicht gefunden." };

  // Alle Leads dieses Imports löschen (CASCADE löscht lead_contacts, lead_changes, etc.)
  const { error: leadsError } = await db
    .from("leads")
    .delete()
    .eq("source_import_id", importId);

  if (leadsError) return { error: leadsError.message };

  // Import-Log löschen
  const { error: logError } = await db
    .from("import_logs")
    .delete()
    .eq("id", importId);

  if (logError) return { error: logError.message };

  await logAudit({
    userId: user?.id ?? null,
    action: "import.deleted",
    entityType: "import_log",
    entityId: importId,
    details: {
      file_name: importLog.file_name,
      leads_deleted: importLog.imported_count,
    },
  });

  revalidatePath("/leads");
  revalidatePath("/import");
  revalidatePath("/");
  return { success: true };
}

export async function loadMappingTemplates() {
  const db = createServiceClient();
  const { data } = await db
    .from("mapping_templates")
    .select("*")
    .order("name");
  return data ?? [];
}
