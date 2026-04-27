import type { SupabaseClient } from "@supabase/supabase-js";

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
    const domain = row.domain ? normalizeDomain(row.domain) : null;

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

/** Prueft Duplikate gegen die bestehende DB (Fuzzy-Match auf Domain + Firmenname).
 *  Gibt pro CSV-Zeilen-Index zurueck: bestehende Lead-ID + ob der Lead aussortiert ist. */
export async function findDbDuplicatesDetailed(
  supabase: SupabaseClient,
  rows: Record<string, string | null>[],
): Promise<Map<number, DuplicateMatch>> {
  const duplicates = new Map<number, DuplicateMatch>();

  // IDs aller archivierten Status laden — fuer das Archived-Flag im Treffer.
  const { data: archivedRows } = await supabase
    .from("custom_lead_statuses")
    .select("id")
    .eq("is_archived", true);
  const archivedSet = new Set((archivedRows ?? []).map((r) => r.id as string));

  // Alle existierenden Leads laden (ID, Domain, Name, Stadt, CRM-Status)
  const { data: existingLeads } = await supabase
    .from("leads")
    .select("id, domain, company_name, city, crm_status_id");

  if (!existingLeads || existingLeads.length === 0) return duplicates;

  const existingWithDomain = existingLeads
    .filter((l) => l.domain)
    .map((l) => ({ ...l, normalizedDomain: normalizeDomain(l.domain!) }));

  function buildMatch(lead: { id: string; crm_status_id: string | null }): DuplicateMatch {
    return {
      leadId: lead.id,
      archived: lead.crm_status_id != null && archivedSet.has(lead.crm_status_id),
    };
  }

  rows.forEach((row, index) => {
    // Domain-Match
    if (row.domain) {
      const d = normalizeDomain(row.domain);
      const match = existingWithDomain.find((e) => isDomainMatch(d, e.normalizedDomain));
      if (match) {
        duplicates.set(index, buildMatch(match));
        return;
      }
    }

    // Fuzzy Name-Match
    if (row.company_name) {
      const match = existingLeads.find((existing) => {
        if (!existing.company_name) return false;
        const sameCity = !row.city || !existing.city ||
          row.city.toLowerCase() === existing.city.toLowerCase();
        return sameCity && isFuzzyMatch(row.company_name!, existing.company_name);
      });
      if (match) {
        duplicates.set(index, buildMatch(match));
      }
    }
  });

  return duplicates;
}
