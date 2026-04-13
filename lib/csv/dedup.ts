import type { SupabaseClient } from "@supabase/supabase-js";

/** Prüft Duplikate innerhalb eines CSV-Batches */
export function findInternalDuplicates(
  rows: Record<string, string | null>[],
): Set<number> {
  const seen = new Map<string, number>();
  const duplicates = new Set<number>();

  rows.forEach((row, index) => {
    const keys = [
      // Duplikat-Schlüssel: domain oder firmenname+ort
      row.domain?.toLowerCase(),
      row.company_name && row.city
        ? `${row.company_name.toLowerCase()}|${row.city.toLowerCase()}`
        : null,
    ].filter(Boolean);

    for (const key of keys) {
      if (!key) continue;
      if (seen.has(key)) {
        duplicates.add(index);
      } else {
        seen.set(key, index);
      }
    }
  });

  return duplicates;
}

/** Prüft Duplikate gegen die bestehende Datenbank */
export async function findDbDuplicates(
  supabase: SupabaseClient,
  rows: Record<string, string | null>[],
): Promise<Set<number>> {
  const duplicates = new Set<number>();

  // Alle Domains und Firmennamen sammeln
  const domains = rows
    .map((r) => r.domain?.toLowerCase())
    .filter(Boolean) as string[];

  const companyNames = rows
    .map((r) => r.company_name?.toLowerCase())
    .filter(Boolean) as string[];

  if (domains.length === 0 && companyNames.length === 0) return duplicates;

  // Domain-basierter Check
  if (domains.length > 0) {
    const { data: existingByDomain } = await supabase
      .from("leads")
      .select("domain")
      .in("domain", domains);

    const existingDomains = new Set(
      (existingByDomain ?? []).map((r) => r.domain?.toLowerCase()),
    );

    rows.forEach((row, index) => {
      if (row.domain && existingDomains.has(row.domain.toLowerCase())) {
        duplicates.add(index);
      }
    });
  }

  // Firmenname-basierter Check (nur für Zeilen ohne Domain)
  if (companyNames.length > 0) {
    const { data: existingByName } = await supabase
      .from("leads")
      .select("company_name, city")
      .in("company_name", companyNames);

    const existingKeys = new Set(
      (existingByName ?? []).map(
        (r) =>
          `${r.company_name?.toLowerCase()}|${r.city?.toLowerCase() ?? ""}`,
      ),
    );

    rows.forEach((row, index) => {
      if (!row.domain && row.company_name) {
        const key = `${row.company_name.toLowerCase()}|${row.city?.toLowerCase() ?? ""}`;
        if (existingKeys.has(key)) {
          duplicates.add(index);
        }
      }
    });
  }

  return duplicates;
}
