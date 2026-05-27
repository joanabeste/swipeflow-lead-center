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

// ─── Google-Maps-Export Helpers ─────────────────────────────

/**
 * Behebt Mojibake-Zeichen aus als Latin-1 fehl-decodiertem UTF-8.
 * Tritt bei Google-Maps-Exports und Instant-Data-Scraper-CSVs regelmäßig auf.
 */
export function fixMojibake(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/Ã¤/g, "ä").replace(/Ã¶/g, "ö").replace(/Ã¼/g, "ü")
    .replace(/Ã„/g, "Ä").replace(/Ã–/g, "Ö").replace(/Ãœ/g, "Ü")
    .replace(/ÃŸ/g, "ß").replace(/Â·/g, "").replace(/Â­/g, "")
    .replace(/Â /g, " ").trim();
}

/**
 * Extrahiert die nackte Domain aus einer Eingabe-URL. Filtert Google-Ads-
 * Tracking-Links (`google.com/aclk`) und ungültige Werte (kein gültiger
 * Hostname mit TLD) komplett aus, sodass nur brauchbare Domains durchkommen.
 *
 * Lokale Variable `domain` = der Hostname-String. Das DB-Feld dafür heißt
 * inzwischen `website` — die Aufrufer mappen lokal um.
 */
export function extractWebsiteAndDomain(websiteRaw: string | null | undefined): {
  domain: string | null;
} {
  const trimmed = websiteRaw?.trim() ?? "";
  if (!trimmed) return { domain: null };
  if (trimmed.includes("google.com/aclk")) return { domain: null };
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const host = url.hostname.replace(/^www\./, "");
    // Hostname muss mindestens einen Punkt haben (echte Domain mit TLD)
    if (!host.includes(".")) return { domain: null };
    return { domain: host };
  } catch {
    return { domain: null };
  }
}

/** Erkennt, ob ein String wie eine URL aussieht (auch ohne http-Prefix). */
export function looksLikeUrl(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (/^https?:\/\//i.test(t)) return true;
  if (/^www\./i.test(t)) return true;
  // Domain-ähnlich: foo.bar(/...)
  return /^[a-z0-9-]+\.[a-z]{2,}(\/|$)/i.test(t);
}

/**
 * Erkennt eine Telefonnummer (DE-tolerant): muss mind. 5 Ziffern enthalten und darf
 * neben Ziffern nur Leerzeichen, +, -, /, () enthalten. Schließt URLs explizit aus.
 */
export function looksLikePhone(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (looksLikeUrl(t)) return false;
  const digits = t.replace(/\D/g, "");
  if (digits.length < 5) return false;
  return /^[\d\s+\-/().]+$/.test(t);
}

/**
 * Defensive Telefon-Extraktion fuer positionsbasierte Scraper-CSVs (Google Maps):
 * nimmt zuerst die erwartete Spalte; wenn dort kein Telefon-Pattern steht
 * (z.B. „Schliesst um 17:00" wegen verschobener W4Efsd-Spalten), durchsucht
 * die restlichen Zellen der Zeile nach dem ersten Telefon-tauglichen Wert.
 */
export function extractPhoneSafe(row: string[], primaryIndex: number): string | null {
  const primary = sanitizeCellValue(fixMojibake(row[primaryIndex] ?? ""));
  if (primary && looksLikePhone(primary)) return primary;
  for (let i = 0; i < row.length; i++) {
    if (i === primaryIndex) continue;
    const v = sanitizeCellValue(fixMojibake(row[i] ?? ""));
    if (v && looksLikePhone(v)) return v;
  }
  return null;
}

/**
 * Parst PLZ + Stadt aus dem Adress-Pfad einer Google-Maps-`/maps/dir/`-URL.
 * Beispiel-Eingabe (URL-encoded): `…/Auewiesen+9,+32339+Espelkamp/data=…`
 * → `{ zip: "32339", city: "Espelkamp" }`. Bei Miss → beide null.
 */
export function parseCityZipFromMapsUrl(url: string | null | undefined): {
  city: string | null;
  zip: string | null;
} {
  if (!url) return { city: null, zip: null };
  let decoded: string;
  try { decoded = decodeURIComponent(url); } catch { decoded = url; }
  const m = decoded.match(/,\s*(\d{5})\s+([^,/]+?)(?=\/|,|$)/);
  if (!m) return { city: null, zip: null };
  return { zip: m[1], city: m[2].trim() };
}

/** Extrahiert lat/lng aus einer Google-Maps-Place-URL (`!3d<lat>!4d<lng>`). */
export function parseLatLngFromMapsUrl(url: string | null | undefined): { lat: number; lng: number } | null {
  if (!url) return null;
  const m = url.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

/** Parst "4,8" → 4.8 (deutsches Komma-Format). */
export function parseGoogleRating(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.replace(",", "."));
  return Number.isNaN(n) || n < 0 || n > 5 ? null : n;
}

/** Parst "(24)" oder "24" → 24. */
export function parseGoogleReviewCount(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[().\s]/g, "").replace(",", "");
  const n = parseInt(cleaned, 10);
  return Number.isNaN(n) || n < 0 ? null : n;
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
  /** Spalten-Name `website` aus der DB; Inhalt ist die nackte Domain. */
  website: string | null;
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
    if (l.website) {
      const norm = normalizeDomain(l.website);
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
 * Parst einen importierten Vertreter-/Kontakt-Namen.
 *
 * Akzeptiert Formen wie:
 *   "Max Mustermann"                      → { name: "Max Mustermann", role: null }
 *   "Max Mustermann (Geschaeftsfuehrer)"  → { name: "Max Mustermann", role: "Geschaeftsfuehrer" }
 * Liefert null, wenn der Wert leer/whitespace ist.
 */
export function parseContactName(raw: string | null | undefined): { name: string; role: string | null } | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (match) return { name: match[1].trim(), role: match[2].trim() };
  return { name: trimmed, role: null };
}

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
