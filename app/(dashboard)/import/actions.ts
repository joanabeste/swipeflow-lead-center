"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseCSV } from "@/lib/csv/parser";
import { normalizeLeadRow } from "@/lib/csv/normalizer";
import { logAudit } from "@/lib/audit-log";
import {
  validateCsvSize,
  sanitizeCellValue,
  createImportLog,
} from "@/lib/csv/import-helpers";
import { ingestLeads } from "@/lib/leads/ingest";

export async function processImport(
  fileContent: string,
  mapping: Record<string, string>,
  delimiter: string,
  templateName?: string,
  vertical: "webdesign" | "recruiting" | null = null,
  originalFileName?: string,
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
      fileName: originalFileName ?? "csv-import",
      rowCount: rows.length,
      importType: "csv",
      userId: user?.id ?? null,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Import-Log fehlgeschlagen" };
  }

  // Original-CSV in Supabase Storage ablegen — best-effort, der Import laeuft
  // auch ohne Upload weiter. Nach 30 Tagen wird die Datei vom Cleanup-Cron
  // (/api/cron/cleanup-import-csvs) wieder entfernt.
  const csvBytes = Buffer.byteLength(fileContent, "utf8");
  const MAX_CSV_BYTES = 20 * 1024 * 1024; // 20 MB
  if (csvBytes <= MAX_CSV_BYTES) {
    const storagePath = `${importLog.id}.csv`;
    const { error: upErr } = await db.storage
      .from("import-csvs")
      .upload(storagePath, fileContent, {
        contentType: "text/csv; charset=utf-8",
        upsert: true,
        cacheControl: "0",
      });
    if (!upErr) {
      await db.from("import_logs").update({
        csv_storage_path: storagePath,
        csv_size_bytes: csvBytes,
        csv_expires_at: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
      }).eq("id", importLog.id);
    }
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

  // Gemeinsame Import-Logik: Dedup, Blacklist, Cancel-Rules, Batch-Insert von Leads +
  // Kontakten, Log-Abschluss und Audit. Beim CSV-Import werden bestehende Leads ergaenzt
  // ("merge"), genau wie bisher.
  const result = await ingestLeads(db, mappedRows, importLog.id, {
    userId: user?.id ?? null,
    vertical,
    onDuplicate: "merge",
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

  revalidatePath("/leads");
  revalidatePath("/import");
  revalidatePath("/");

  return {
    success: true,
    imported: result.imported,
    skipped: result.skipped,
    duplicates: result.duplicates,
    updated: result.updated,
    archived: result.archived,
    errors: result.errors,
    contacts_imported: result.contacts_imported,
  };
}

export async function deleteImport(importId: string) {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Import-Log laden für Audit + Storage-Pfad fuer Cleanup
  const { data: importLog } = await db
    .from("import_logs")
    .select("file_name, imported_count, csv_storage_path")
    .eq("id", importId)
    .single();

  if (!importLog) return { error: "Import nicht gefunden." };

  // Alle Leads dieses Imports löschen (CASCADE löscht lead_contacts, lead_changes, etc.)
  const { error: leadsError } = await db
    .from("leads")
    .delete()
    .eq("source_import_id", importId);

  if (leadsError) return { error: leadsError.message };

  // Original-CSV im Storage mit-loeschen, damit nichts verwaist (best-effort).
  if (importLog.csv_storage_path) {
    await db.storage.from("import-csvs").remove([importLog.csv_storage_path as string]);
  }

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
