import type { SupabaseClient } from "@supabase/supabase-js";
import { isFuzzyMatch, isGenericDomain, isLeadArchived, normalizeDomain, computeSharedDomains } from "@/lib/csv/dedup";
import { normalizeEmail, normalizePhone } from "@/lib/csv/normalizer";
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
  byEmail: Map<string, string>;        // normalisierte Email → leadId
  byPhone: Map<string, string>;        // normalisierte Phone → leadId
  archivedIds: Set<string>;            // Lead-IDs, die als archiviert gelten
  crmStatusById: Map<string, { status: string | null; crmStatusId: string | null }>;
  sharedDomains: Set<string>;          // geteilte Domains (Verzeichnisse/Portale) — kein Domain-Match
}

export interface ExistingLeadRow {
  id: string;
  company_name: string;
  /** Spalten-Name `website` aus der DB; Inhalt ist die nackte Domain. */
  website: string | null;
  status?: string | null;
  crm_status_id?: string | null;
  email?: string | null;
  phone?: string | null;
  lifecycle_stage?: string | null;
  deleted_at?: string | null;
}

/**
 * Baut einen Index für O(1)-Domain-/Email-/Phone-Lookup + sortierte Liste für Fuzzy-Match.
 * Ersetzt das O(n²)-Pattern, bei dem für jede CSV-Zeile alle existierenden
 * Leads iteriert wurden.
 */
export function buildLeadIndex(
  leads: ExistingLeadRow[],
  archivedStatusIds: Set<string>,
): LeadIndex {
  const byDomain = new Map<string, string>();
  const byName: { id: string; name: string }[] = [];
  const byEmail = new Map<string, string>();
  const byPhone = new Map<string, string>();
  const archivedIds = new Set<string>();
  const crmStatusById = new Map<string, { status: string | null; crmStatusId: string | null }>();
  // Geteilte Domains (Branchenverzeichnisse/Portale wie malerfinder.de) vorab ermitteln.
  const sharedDomains = computeSharedDomains(leads);
  for (const l of leads) {
    if (l.website) {
      const norm = normalizeDomain(l.website);
      // Generische UND geteilte Domains NICHT als Dedup-Schlüssel indizieren.
      if (norm && !isGenericDomain(norm) && !sharedDomains.has(norm) && !byDomain.has(norm)) byDomain.set(norm, l.id);
    }
    byName.push({ id: l.id, name: l.company_name });
    const e = normalizeEmail(l.email ?? null);
    if (e && !byEmail.has(e)) byEmail.set(e, l.id);
    const p = normalizePhone(l.phone ?? null);
    if (p && !byPhone.has(p)) byPhone.set(p, l.id);
    if (
      isLeadArchived(
        {
          lifecycle_stage: l.lifecycle_stage ?? null,
          deleted_at: l.deleted_at ?? null,
          crm_status_id: l.crm_status_id ?? null,
        },
        archivedStatusIds,
      )
    ) {
      archivedIds.add(l.id);
    }
    crmStatusById.set(l.id, {
      status: l.status ?? null,
      crmStatusId: l.crm_status_id ?? null,
    });
  }
  return { byDomain, byName, byEmail, byPhone, archivedIds, crmStatusById, sharedDomains };
}

/**
 * Nimmt einen frisch im selben Import-Batch eingeplanten (noch nicht
 * eingefuegten) Lead in den In-Memory-Index auf, damit eine spaetere Zeile
 * desselben Batches per Domain/E-Mail/Telefon/Name gegen ihn matcht
 * (Within-Batch-Dedup). Pendant zu `addLeadToIndex` in dedup.ts, aber fuer den
 * `LeadIndex`-Typ der Scraper-Importe. Der Lead gilt als nicht-archiviert und
 * nicht im CRM (frischer Import-Lead).
 */
export function addToLeadIndex(
  index: LeadIndex,
  lead: { id: string; company_name: string; website: string | null; email?: string | null; phone?: string | null },
): void {
  if (lead.website) {
    const norm = normalizeDomain(lead.website);
    if (norm && !isGenericDomain(norm) && !index.sharedDomains.has(norm) && !index.byDomain.has(norm)) {
      index.byDomain.set(norm, lead.id);
    }
  }
  index.byName.push({ id: lead.id, name: lead.company_name });
  const e = normalizeEmail(lead.email ?? null);
  if (e && !index.byEmail.has(e)) index.byEmail.set(e, lead.id);
  const p = normalizePhone(lead.phone ?? null);
  if (p && !index.byPhone.has(p)) index.byPhone.set(p, lead.id);
  index.crmStatusById.set(lead.id, { status: null, crmStatusId: null });
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
 * Findet einen passenden bestehenden Lead.
 * Reihenfolge: Domain → Email → Phone → Fuzzy-Name.
 */
export function findMatchingLead(
  index: LeadIndex,
  key: {
    domain: string | null;
    companyName: string;
    email?: string | null;
    phone?: string | null;
  },
): { leadId: string; archived: boolean } | null {
  const hit = (leadId: string) => ({ leadId, archived: index.archivedIds.has(leadId) });

  if (key.domain) {
    const norm = normalizeDomain(key.domain);
    if (norm && !isGenericDomain(norm) && !index.sharedDomains.has(norm)) {
      const match = index.byDomain.get(norm);
      if (match) return hit(match);
    }
  }
  if (key.email) {
    const e = normalizeEmail(key.email);
    if (e) {
      const match = index.byEmail.get(e);
      if (match) return hit(match);
    }
  }
  if (key.phone) {
    const p = normalizePhone(key.phone);
    if (p) {
      const match = index.byPhone.get(p);
      if (match) return hit(match);
    }
  }
  for (const { id, name } of index.byName) {
    if (isFuzzyMatch(key.companyName, name)) return hit(id);
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

// ─── Import-Historie laden (mit Schema-Fallback) ────────────

export const IMPORT_LOG_BASE_COLS =
  "id, file_name, row_count, imported_count, duplicate_count, error_count, status, created_at, import_type, source_url, updated_count, skipped_count";
export const IMPORT_LOG_WITH_CSV_COLS = `${IMPORT_LOG_BASE_COLS}, csv_storage_path, csv_expires_at`;
/** Seitengröße der Vergangene-Imports-Liste (page.tsx + "Mehr laden"). */
export const IMPORT_HISTORY_PAGE_SIZE = 20;

/**
 * Lädt eine Seite der Import-Historie (neueste zuerst), robust gegen alte
 * Schemata ohne CSV-Storage-Spalten (Code 42703 → Fallback auf Basis-Spalten).
 * `from`/`to` sind inklusive Range-Indizes (Supabase `.range`). Sekundär nach `id`
 * sortiert, damit die Paginierung bei gleichem `created_at` stabil bleibt
 * (keine Duplikate/Lücken zwischen den Seiten).
 */
export async function fetchImportLogsPage(
  db: SupabaseClient,
  from: number,
  to: number,
  withCount = false,
): Promise<{
  data: Record<string, unknown>[] | null;
  error: { message: string; code?: string } | null;
  count: number | null;
}> {
  const run = (cols: string) =>
    db
      .from("import_logs")
      .select(cols, withCount ? { count: "exact" } : undefined)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

  // Daten-Cast: Supabase kann die dynamischen Spalten-Strings nicht typisieren
  // (liefert sonst GenericStringError) — die Aufrufer behandeln die Zeilen ohnehin
  // generisch als Record<string, unknown>.
  const asRows = (d: unknown) => (d as Record<string, unknown>[] | null) ?? null;

  const first = await run(IMPORT_LOG_WITH_CSV_COLS);
  if (first.error && first.error.code === "42703") {
    const second = await run(IMPORT_LOG_BASE_COLS);
    return { data: asRows(second.data), error: second.error, count: second.count ?? null };
  }
  return { data: asRows(first.data), error: first.error, count: first.count ?? null };
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
