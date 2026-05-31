import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { normalizeEmail, normalizePhone } from "@/lib/csv/normalizer";

// ============================================================
// Normalisierung für Fuzzy-Matching
// ============================================================

const UMLAUT_MAP: Record<string, string> = {
  ä: "ae", ö: "oe", ü: "ue", ß: "ss",
  Ä: "Ae", Ö: "Oe", Ü: "Ue",
};

const LEGAL_FORMS = [
  "gmbh & co. kgaa", "gmbh & co. kg", "gmbh & co. ohg",
  "ag & co. kg", "ag & co. kgaa",
  "gmbh", "mbh", "ug", "ag", "se", "kg", "ohg", "gbr",
  "kgaa", "e.v.", "e.k.", "eg",
  "ug (haftungsbeschränkt)", "haftungsbeschränkt",
  "mbh & co. kg",
];

/** Normalisiert einen Firmennamen für Vergleiche */
export function normalizeName(name: string): string {
  let n = name.toLowerCase().trim();

  // Umlaute ersetzen
  n = n.replace(/[äöüßÄÖÜ]/g, (c) => UMLAUT_MAP[c] ?? c);

  // Rechtsformen entfernen (längste zuerst)
  for (const form of LEGAL_FORMS) {
    const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    n = n.replace(new RegExp(`\\s*${escaped}\\s*$`, "i"), "");
    n = n.replace(new RegExp(`^\\s*${escaped}\\s+`, "i"), "");
  }

  // Sonderzeichen und Mehrfach-Leerzeichen
  n = n.replace(/[^a-z0-9\s]/g, " ");
  n = n.replace(/\s+/g, " ").trim();

  return n;
}

/** Normalisiert eine Domain */
export function normalizeDomain(domain: string): string {
  let d = domain.toLowerCase().trim();
  d = d.replace(/^(https?:\/\/)?(www\.)?/, "");
  d = d.replace(/\/.*$/, "");
  return d;
}

/** Einfache Ähnlichkeitsberechnung (Bigram-basiert, schneller als Levenshtein) */
function bigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.slice(i, i + 2));

  let matches = 0;
  const totalB = b.length - 1;
  for (let i = 0; i < totalB; i++) {
    if (bigramsA.has(b.slice(i, i + 2))) matches++;
  }

  return (2 * matches) / (bigramsA.size + totalB);
}

/** Prüft ob zwei Firmennamen wahrscheinlich dasselbe Unternehmen sind */
export function isFuzzyMatch(nameA: string, nameB: string): boolean {
  const a = normalizeName(nameA);
  const b = normalizeName(nameB);

  // Exakter Match nach Normalisierung
  if (a === b) return true;

  // Einer enthält den anderen
  if (a.length > 3 && b.length > 3) {
    if (a.includes(b) || b.includes(a)) return true;
  }

  // Bigram-Ähnlichkeit > 0.8
  return bigramSimilarity(a, b) >= 0.8;
}

/** Prüft ob zwei Domains zusammengehören */
export function isDomainMatch(domainA: string, domainB: string): boolean {
  const a = normalizeDomain(domainA);
  const b = normalizeDomain(domainB);
  if (a === b) return true;

  // Sub-Domain-Match (z.B. karriere.firma.de vs firma.de)
  const partsA = a.split(".");
  const partsB = b.split(".");
  if (partsA.length > 2 && partsB.length >= 2) {
    if (a.endsWith(`.${b}`)) return true;
  }
  if (partsB.length > 2 && partsA.length >= 2) {
    if (b.endsWith(`.${a}`)) return true;
  }

  return false;
}

// ============================================================
// Import-Duplikat-Erkennung
// ============================================================

/** Prüft Duplikate innerhalb eines CSV-Batches (mit Fuzzy-Matching) */
export function findInternalDuplicates(
  rows: Record<string, string | null>[],
): Set<number> {
  const duplicates = new Set<number>();
  const processed: { index: number; name: string; domain: string | null }[] = [];

  rows.forEach((row, index) => {
    const name = row.company_name ?? "";
    const domain = row.website ? normalizeDomain(row.website) : null;

    for (const prev of processed) {
      // Domain-Match
      if (domain && prev.domain && isDomainMatch(domain, prev.domain)) {
        duplicates.add(index);
        return;
      }
      // Fuzzy Name-Match (nur wenn gleiche Stadt oder keine Stadt)
      if (name && prev.name) {
        const sameCity = !row.city || !rows[prev.index]?.city ||
          row.city?.toLowerCase() === rows[prev.index]?.city?.toLowerCase();
        if (sameCity && isFuzzyMatch(name, prev.name)) {
          duplicates.add(index);
          return;
        }
      }
    }

    processed.push({ index, name, domain });
  });

  return duplicates;
}

export interface DuplicateMatch {
  leadId: string;
  /** true, wenn der Treffer ein aussortierter Lead ist (CRM-Status mit is_archived=true).
   *  Solche Leads werden im Import komplett uebersprungen, kein Update. */
  archived: boolean;
}

export interface ExistingLead {
  id: string;
  website: string | null;
  company_name: string | null;
  city: string | null;
  crm_status_id: string | null;
  email: string | null;
  phone: string | null;
  lifecycle_stage: string | null;
  deleted_at: string | null;
}

/** Einmalig geladener Snapshot aller bestehenden Leads + archivierter Status.
 *  Wird fuer Batch-Importe einmal gebaut und pro Lead gegen findDbDuplicateForLead geprueft,
 *  statt die DB pro Zeile neu zu laden. */
export interface ExistingLeadsIndex {
  existingLeads: ExistingLead[];
  existingWithDomain: (ExistingLead & { normalizedDomain: string })[];
  byEmail: Map<string, ExistingLead>;
  byPhone: Map<string, ExistingLead>;
  archivedSet: Set<string>;
}

/** Zentrale Wahrheit, wann ein Lead aus Dedup-Sicht als archiviert gilt:
 *  lifecycle_stage='archived', soft-deleted, oder CRM-Status mit is_archived=true. */
export function isLeadArchived(
  lead: Pick<ExistingLead, "lifecycle_stage" | "deleted_at" | "crm_status_id">,
  archivedSet: Set<string>,
): boolean {
  if (lead.lifecycle_stage === "archived") return true;
  if (lead.deleted_at != null) return true;
  if (lead.crm_status_id != null && archivedSet.has(lead.crm_status_id)) return true;
  return false;
}

/** Laedt alle bestehenden Leads + archivierte CRM-Status genau einmal. */
export async function loadExistingLeadsIndex(
  supabase: SupabaseClient,
): Promise<ExistingLeadsIndex> {
  // IDs aller archivierten Status laden — fuer das Archived-Flag im Treffer.
  const { data: archivedRows } = await supabase
    .from("custom_lead_statuses")
    .select("id")
    .eq("is_archived", true);
  const archivedSet = new Set((archivedRows ?? []).map((r) => r.id as string));

  // Alle existierenden Leads laden (paginiert — PostgREST-Limit umgehen)
  const leads = await fetchAllRows<ExistingLead>(
    supabase,
    "leads",
    "id, website, company_name, city, crm_status_id, email, phone, lifecycle_stage, deleted_at",
  );
  const existingWithDomain = leads
    .filter((l) => l.website)
    .map((l) => ({ ...l, normalizedDomain: normalizeDomain(l.website!) }));

  const byEmail = new Map<string, ExistingLead>();
  const byPhone = new Map<string, ExistingLead>();
  for (const l of leads) {
    const e = normalizeEmail(l.email);
    if (e && !byEmail.has(e)) byEmail.set(e, l);
    const p = normalizePhone(l.phone);
    if (p && !byPhone.has(p)) byPhone.set(p, l);
  }

  return { existingLeads: leads, existingWithDomain, byEmail, byPhone, archivedSet };
}

/** Fuegt einen frisch eingefuegten Lead dem In-Memory-Index hinzu, damit spaetere
 *  Eintraege im selben Batch gegen ihn matchen koennen. */
export function addLeadToIndex(index: ExistingLeadsIndex, lead: ExistingLead): void {
  index.existingLeads.push(lead);
  if (lead.website) {
    index.existingWithDomain.push({ ...lead, normalizedDomain: normalizeDomain(lead.website) });
  }
  const e = normalizeEmail(lead.email);
  if (e && !index.byEmail.has(e)) index.byEmail.set(e, lead);
  const p = normalizePhone(lead.phone);
  if (p && !index.byPhone.has(p)) index.byPhone.set(p, lead);
}

/** Prueft einen einzelnen Lead gegen den Index.
 *  strict=true (Scrape/URL ohne Stadt): Treffer nur bei Domain-Match ODER exaktem
 *  normalisiertem Namen — kein reiner Fuzzy-Match, um verschiedene Firmen nicht zu mergen. */
export function findDbDuplicateForLead(
  index: ExistingLeadsIndex,
  lead: {
    company_name?: string | null;
    website?: string | null;
    city?: string | null;
    email?: string | null;
    phone?: string | null;
  },
  opts?: { strict?: boolean },
): DuplicateMatch | null {
  const { existingLeads, existingWithDomain, byEmail, byPhone, archivedSet } = index;
  const strict = opts?.strict ?? false;

  const buildMatch = (l: ExistingLead): DuplicateMatch => ({
    leadId: l.id,
    archived: isLeadArchived(l, archivedSet),
  });

  // Domain-Match (Property website = nackte Domain)
  if (lead.website) {
    const d = normalizeDomain(lead.website);
    const match = existingWithDomain.find((e) => isDomainMatch(d, e.normalizedDomain));
    if (match) return buildMatch(match);
  }

  // Email-Match (normalisiert)
  if (lead.email) {
    const e = normalizeEmail(lead.email);
    if (e) {
      const hit = byEmail.get(e);
      if (hit) return buildMatch(hit);
    }
  }

  // Phone-Match (normalisiert)
  if (lead.phone) {
    const p = normalizePhone(lead.phone);
    if (p) {
      const hit = byPhone.get(p);
      if (hit) return buildMatch(hit);
    }
  }

  // Namens-Match
  if (lead.company_name) {
    const match = existingLeads.find((existing) => {
      if (!existing.company_name) return false;
      const sameCity = !lead.city || !existing.city ||
        lead.city.toLowerCase() === existing.city.toLowerCase();
      if (strict) {
        // Ohne verlaessliche Stadt nur exakter Name nach Normalisierung.
        if (normalizeName(lead.company_name!) !== normalizeName(existing.company_name)) return false;
        // Widersprechende Domains schliessen einen Namens-Match aus
        // (zwei gleichnamige Firmen mit unterschiedlicher Website sind verschieden).
        if (lead.website && existing.website && !isDomainMatch(lead.website, existing.website)) return false;
        return sameCity;
      }
      return sameCity && isFuzzyMatch(lead.company_name!, existing.company_name);
    });
    if (match) return buildMatch(match);
  }

  return null;
}

/** Prueft Duplikate gegen die bestehende DB (Fuzzy-Match auf Domain + Firmenname).
 *  Gibt pro CSV-Zeilen-Index zurueck: bestehende Lead-ID + ob der Lead aussortiert ist. */
export async function findDbDuplicatesDetailed(
  supabase: SupabaseClient,
  rows: Record<string, string | null>[],
): Promise<Map<number, DuplicateMatch>> {
  const duplicates = new Map<number, DuplicateMatch>();

  const index = await loadExistingLeadsIndex(supabase);
  if (index.existingLeads.length === 0) return duplicates;

  rows.forEach((row, i) => {
    const match = findDbDuplicateForLead(index, row);
    if (match) duplicates.set(i, match);
  });

  return duplicates;
}
