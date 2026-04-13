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

/** Prüft Duplikate gegen die bestehende Datenbank (mit Fuzzy-Matching) */
export async function findDbDuplicates(
  supabase: SupabaseClient,
  rows: Record<string, string | null>[],
): Promise<Set<number>> {
  const duplicates = new Set<number>();

  // Alle Domains und Firmennamen sammeln
  const domains = rows
    .map((r) => r.domain ? normalizeDomain(r.domain) : null)
    .filter(Boolean) as string[];

  // Domain-basierter Check (exakt + normalisiert)
  if (domains.length > 0) {
    const { data: existingByDomain } = await supabase
      .from("leads")
      .select("domain")
      .not("domain", "is", null);

    const existingDomains = (existingByDomain ?? [])
      .map((r) => r.domain ? normalizeDomain(r.domain) : null)
      .filter(Boolean) as string[];

    rows.forEach((row, index) => {
      if (row.domain) {
        const d = normalizeDomain(row.domain);
        if (existingDomains.some((ed) => isDomainMatch(d, ed))) {
          duplicates.add(index);
        }
      }
    });
  }

  // Firmenname-basierter Fuzzy-Check (nur für Zeilen ohne Domain-Match)
  const rowsWithoutDomainMatch = rows
    .map((r, i) => ({ row: r, index: i }))
    .filter(({ index }) => !duplicates.has(index))
    .filter(({ row }) => row.company_name);

  if (rowsWithoutDomainMatch.length > 0) {
    const { data: existingLeads } = await supabase
      .from("leads")
      .select("company_name, city")
      .not("company_name", "is", null);

    if (existingLeads && existingLeads.length > 0) {
      for (const { row, index } of rowsWithoutDomainMatch) {
        if (!row.company_name) continue;

        const match = existingLeads.some((existing) => {
          if (!existing.company_name) return false;
          const sameCity = !row.city || !existing.city ||
            row.city.toLowerCase() === existing.city.toLowerCase();
          return sameCity && isFuzzyMatch(row.company_name!, existing.company_name);
        });

        if (match) duplicates.add(index);
      }
    }
  }

  return duplicates;
}
