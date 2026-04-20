import type { SupabaseClient } from "@supabase/supabase-js";
import { isFuzzyMatch, normalizeDomain } from "@/lib/csv/dedup";
import type { BlacklistRule, BlacklistEntry, CancelRule } from "@/lib/types";

// ─── Limits ────────────────────────────────────────────────

export const MAX_FILE_SIZE_MB = 50;
export const MAX_ROWS = 10_000;

export interface ImportLimitError {
  ok: false;
  error: string;
}

/** Validiert eine CSV bevor sie verarbeitet wird */
export function validateCsvSize(rowCount: number): ImportLimitError | null {
  if (rowCount > MAX_ROWS) {
    return { ok: false, error: `Zu viele Zeilen: ${rowCount}. Max: ${MAX_ROWS} pro Import.` };
  }
  if (rowCount === 0) {
    return { ok: false, error: "Die Datei enthält keine Datenzeilen." };
  }
  return null;
}

// ─── CSV-Injection-Schutz ───────────────────────────────────

/**
 * Schützt vor CSV-Injection (Excel/Google Sheets RCE):
 * Wenn eine Zelle mit =, +, -, @ oder Tab/CR beginnt, wird ein Apostroph
 * vorangestellt — neutralisiert die Formel beim spätereren Excel-Export.
 */
export function sanitizeCellValue(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}

// ─── Blacklist + Cancel-Rules in einem Rutsch ────────────────

export interface ImportContext {
  rules: BlacklistRule[];
  entries: BlacklistEntry[];
  cancelRules: CancelRule[];
}

export async function loadImportContext(
  db: SupabaseClient,
): Promise<ImportContext> {
  const [{ data: rules }, { data: entries }, { data: cancelRules }] = await Promise.all([
    db.from("blacklist_rules").select("*").eq("is_active", true),
    db.from("blacklist_entries").select("*"),
    db.from("cancel_rules").select("*").eq("is_active", true),
  ]);
  return {
    rules: (rules as BlacklistRule[]) ?? [],
    entries: (entries as BlacklistEntry[]) ?? [],
    cancelRules: (cancelRules as CancelRule[]) ?? [],
  };
}

// ─── O(1)-Lookup für Duplikat-Suche ─────────────────────────

export interface LeadIndex {
  byDomain: Map<string, string>;       // normalisierte Domain → leadId
  byName: { id: string; name: string }[]; // Liste für Fuzzy-Match
  crmStatusById: Map<string, { status: string | null; crmStatusId: string | null }>;
}

export interface ExistingLeadRow {
  id: string;
  company_name: string;
  domain: string | null;
  status?: string | null;
  crm_status_id?: string | null;
}

/**
 * Baut einen Index für O(1)-Domain-Lookup + sortierte Liste für Fuzzy-Match.
 * Ersetzt das O(n²)-Pattern, bei dem für jede CSV-Zeile alle existierenden
 * Leads iteriert wurden.
 */
export function buildLeadIndex(leads: ExistingLeadRow[]): LeadIndex {
  const byDomain = new Map<string, string>();
  const byName: { id: string; name: string }[] = [];
  const crmStatusById = new Map<string, { status: string | null; crmStatusId: string | null }>();
  for (const l of leads) {
    if (l.domain) {
      const norm = normalizeDomain(l.domain);
      if (norm && !byDomain.has(norm)) byDomain.set(norm, l.id);
    }
    byName.push({ id: l.id, name: l.company_name });
    crmStatusById.set(l.id, {
      status: l.status ?? null,
      crmStatusId: l.crm_status_id ?? null,
    });
  }
  return { byDomain, byName, crmStatusById };
}

/**
 * Prüft, ob ein bekannter Lead bereits im CRM zuhause ist.
 * Kriterium: crm_status_id gesetzt ODER status ∈ {qualified, exported}.
 */
export function isLeadInCrm(index: LeadIndex, leadId: string): boolean {
  const info = index.crmStatusById.get(leadId);
  if (!info) return false;
  if (info.crmStatusId != null) return true;
  return info.status === "qualified" || info.status === "exported";
}

/**
 * Findet einen passenden bestehenden Lead via Domain-Lookup (O(1))
 * oder Fuzzy-Name-Match (O(n) im Fallback).
 */
export function findMatchingLead(
  index: LeadIndex,
  domain: string | null,
  companyName: string,
): string | null {
  if (domain) {
    const norm = normalizeDomain(domain);
    if (norm) {
      const match = index.byDomain.get(norm);
      if (match) return match;
    }
  }
  for (const { id, name } of index.byName) {
    if (isFuzzyMatch(companyName, name)) return id;
  }
  return null;
}

// ─── Import-Log mit garantiertem Fail-Fast ──────────────────

export interface ImportLogContext {
  id: string;
  fileName: string;
}

/**
 * Erstellt einen Import-Log-Eintrag und WIRFT bei Fehler — kein silent fail mehr.
 * Damit landet jeder Import garantiert in der Historie oder der User sieht den Fehler.
 */
export async function createImportLog(
  db: SupabaseClient,
  params: {
    fileName: string;
    rowCount: number;
    importType?: string;
    sourceUrl?: string;
    userId: string | null;
  },
): Promise<ImportLogContext> {
  const insertData: Record<string, unknown> = {
    file_name: params.fileName,
    file_path: "",
    row_count: params.rowCount,
    status: "processing",
    created_by: params.userId,
  };
  if (params.importType) insertData.import_type = params.importType;
  if (params.sourceUrl) insertData.source_url = params.sourceUrl;

  let { data, error } = await db
    .from("import_logs")
    .insert(insertData)
    .select("id, file_name")
    .single();

  // Fallback: wenn der CHECK-Constraint für import_type den Wert ablehnt
  // (z.B. weil das Schema die neuen Werte 'ba_job_listing'/'google_maps' nicht kennt),
  // ohne import_type erneut versuchen.
  if (error && (error.code === "23514" || /import_type|type_check/i.test(error.message ?? ""))) {
    delete insertData.import_type;
    const retry = await db
      .from("import_logs")
      .insert(insertData)
      .select("id, file_name")
      .single();
    data = retry.data;
    error = retry.error;
  }

  // Fallback 2: wenn der Insert wegen unbekannter Spalten fehlschlägt (z.B. source_url),
  // entferne sie und versuche erneut.
  if (error && /column .* does not exist/i.test(error.message ?? "")) {
    delete insertData.source_url;
    const retry = await db
      .from("import_logs")
      .insert(insertData)
      .select("id, file_name")
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error || !data) {
    throw new Error(
      `Import-Log konnte nicht erstellt werden: ${error?.message ?? "unbekannter Fehler"}${
        error?.code ? ` (Code ${error.code})` : ""
      }`,
    );
  }
  return { id: data.id, fileName: data.file_name };
}

/** Schließt den Import-Log ab. Tolerant gegenüber fehlenden Spalten. */
export async function finalizeImportLog(
  db: SupabaseClient,
  logId: string,
  stats: {
    imported?: number;
    updated?: number;
    duplicates?: number;
    skipped?: number;
    errors?: number;
    errorDetails?: { row: number; field: string; message: string }[];
    status?: "completed" | "failed";
  },
): Promise<void> {
  const update: Record<string, unknown> = {
    status: stats.status ?? "completed",
  };
  if (stats.imported != null) update.imported_count = stats.imported;
  if (stats.updated != null) update.updated_count = stats.updated;
  if (stats.duplicates != null) update.duplicate_count = stats.duplicates;
  if (stats.skipped != null) update.skipped_count = stats.skipped;
  if (stats.errors != null) update.error_count = stats.errors;
  if (stats.errorDetails && stats.errorDetails.length > 0) update.errors = stats.errorDetails;

  // Erst mit allen Feldern probieren, bei Schema-Fehler nur die garantierten setzen
  const { error } = await db.from("import_logs").update(update).eq("id", logId);
  if (error) {
    await db
      .from("import_logs")
      .update({ status: stats.status ?? "completed" })
      .eq("id", logId);
  }
}

// ─── Batch-Insert Helper ────────────────────────────────────

/**
 * Inserts in Chunks à `batchSize`. Sammelt Fehler pro Batch ohne abzubrechen.
 * Gibt zurück: erfolgreich inserted, fehlgeschlagen, Fehler-Details.
 */
export async function batchInsert<T>(
  db: SupabaseClient,
  table: string,
  rows: T[],
  batchSize = 250,
): Promise<{ inserted: number; failed: number; errors: string[] }> {
  let inserted = 0;
  let failed = 0;
  const errors: string[] = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error } = await db.from(table).insert(chunk);
    if (error) {
      failed += chunk.length;
      errors.push(`Batch ${i}-${i + chunk.length}: ${error.message}`);
    } else {
      inserted += chunk.length;
    }
  }
  return { inserted, failed, errors };
}
