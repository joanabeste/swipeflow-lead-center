"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseCSV } from "@/lib/csv/parser";
import { normalizeLeadRow } from "@/lib/csv/normalizer";
import { findInternalDuplicates, findDbDuplicates } from "@/lib/csv/dedup";
import { checkLead } from "@/lib/blacklist/checker";
import { evaluateCancelRules } from "@/lib/cancel-rules/evaluator";
import type { CancelRule } from "@/lib/types";
import { logAudit } from "@/lib/audit-log";

export async function processImport(
  fileContent: string,
  mapping: Record<string, string>,
  delimiter: string,
  templateName?: string,
) {
  const supabase = await createClient();
  const db = createServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // CSV parsen
  const { headers, rows } = parseCSV(fileContent, delimiter);

  // Import-Log erstellen
  const { data: importLog, error: logError } = await db
    .from("import_logs")
    .insert({
      file_name: "csv-import",
      file_path: "",
      row_count: rows.length,
      status: "processing",
      created_by: user?.id ?? null,
    })
    .select()
    .single();

  if (logError || !importLog) {
    return { error: `Import-Log konnte nicht erstellt werden: ${logError?.message ?? "Unbekannter Fehler"} (Code: ${logError?.code ?? "?"})` };
  }

  // Zeilen auf HubSpot-Schema mappen
  const mappedRows = rows.map((row) => {
    const mapped: Record<string, string | null> = {};
    headers.forEach((header, i) => {
      const targetField = mapping[header];
      if (targetField && row[i]) {
        mapped[targetField] = row[i];
      }
    });
    return normalizeLeadRow(mapped);
  });

  // Interne Duplikate finden
  const internalDups = findInternalDuplicates(mappedRows);

  // DB-Duplikate finden
  const dbDups = await findDbDuplicates(db, mappedRows);

  // Blacklist-Regeln, Einträge und Cancel-Rules laden
  const [{ data: rules }, { data: entries }, { data: cancelRules }] = await Promise.all([
    db.from("blacklist_rules").select("*").eq("is_active", true),
    db.from("blacklist_entries").select("*"),
    db.from("cancel_rules").select("*").eq("is_active", true),
  ]);

  let importedCount = 0;
  let skippedCount = 0;
  let duplicateCount = 0;
  let updatedCount = 0;
  let errorCount = 0;
  const errors: { row: number; field: string; message: string }[] = [];

  // Batch-Insert: 500er Chunks
  const BATCH_SIZE = 500;
  const leadsToInsert: Record<string, unknown>[] = [];

  const updateFields = [
    "domain", "phone", "email", "street", "city", "zip", "state",
    "country", "industry", "company_size", "legal_form", "register_id",
    "website", "description",
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
    const existingLeadId = dbDups.get(i);
    if (existingLeadId) {
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
      }
      continue;
    }

    // Blacklist-Check
    const blacklistResult = checkLead(row, rules ?? [], entries ?? []);

    // Cancel-Rules-Check (Import-Phase)
    const cancelResult = evaluateCancelRules(
      row as unknown as Record<string, unknown>,
      (cancelRules as CancelRule[]) ?? [],
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
    }

    leadsToInsert.push({
      company_name: row.company_name,
      domain: row.domain,
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
      website: row.website,
      description: row.description,
      status,
      blacklist_hit: blacklistHit,
      blacklist_reason: blacklistReason,
      cancel_reason: cancelReason,
      cancel_rule_id: cancelRuleId,
      source_import_id: importLog.id,
      created_by: user?.id ?? null,
    });

    importedCount++;
  }

  // Batch-Inserts
  for (let i = 0; i < leadsToInsert.length; i += BATCH_SIZE) {
    const batch = leadsToInsert.slice(i, i + BATCH_SIZE);
    const { error } = await db.from("leads").insert(batch);
    if (error) {
      errorCount += batch.length;
      importedCount -= batch.length;
      errors.push({ row: i, field: "", message: error.message });
    }
  }

  // Import-Log aktualisieren
  await db
    .from("import_logs")
    .update({
      status: "completed",
      imported_count: importedCount,
      skipped_count: skippedCount,
      duplicate_count: duplicateCount,
      updated_count: updatedCount,
      error_count: errorCount,
      errors,
    })
    .eq("id", importLog.id);

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
      errors: errorCount,
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
    errors: errorCount,
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
