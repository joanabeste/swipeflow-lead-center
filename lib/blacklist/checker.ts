import type { BlacklistEntry, BlacklistRule } from "@/lib/types";

interface CheckResult {
  blocked: boolean;
  reasons: string[];
}

export function checkLead(
  lead: Record<string, string | null>,
  rules: BlacklistRule[],
  entries: BlacklistEntry[],
): CheckResult {
  const reasons: string[] = [];

  // Manuelle Blacklist-Einträge prüfen
  for (const entry of entries) {
    const rawLeadValue = getMatchField(lead, entry.match_type);
    if (!rawLeadValue) continue;

    // Firmenname: gezielt Konzerne filtern — nur ganze Wörter (Klammer-Inhaber &
    // Bindestrich-Nachnamen ausgenommen) UND nur, wenn der Name eine Rechtsform
    // einer Kapitalgesellschaft trägt. So matcht "Henkel" → "Henkel AG", aber
    // nicht "… (Rebekka Wildenmann-Henkel)" oder das Einzelunternehmen "Praxis Henkel".
    // Domain/Register-ID: exakter Match (case-insensitive).
    const matches = entry.match_type === "name"
      ? matchesCompanyName(rawLeadValue, entry.match_value)
      : rawLeadValue.toLowerCase() === entry.match_value.toLowerCase();

    if (matches) {
      reasons.push(
        `Blacklist: ${entry.match_type} "${entry.match_value}"${entry.reason ? ` (${entry.reason})` : ""}`,
      );
    }
  }

  // Regelbasierte Filter prüfen
  for (const rule of rules) {
    if (!rule.is_active) continue;

    const fieldValue = lead[rule.field]?.toLowerCase() ?? "";
    if (!fieldValue) continue;

    const ruleValue = rule.value.toLowerCase();

    let matches = false;
    switch (rule.operator) {
      case "equals":
        matches = fieldValue === ruleValue;
        break;
      case "contains":
        matches = fieldValue.includes(ruleValue);
        break;
      case "starts_with":
        matches = fieldValue.startsWith(ruleValue);
        break;
      case "in_list": {
        try {
          const list = JSON.parse(rule.value) as string[];
          matches = list.some((v) => v.toLowerCase() === fieldValue);
        } catch {
          matches = false;
        }
        break;
      }
    }

    if (matches) {
      reasons.push(`Regel "${rule.name}": ${rule.field} ${rule.operator} "${rule.value}"`);
    }
  }

  return { blocked: reasons.length > 0, reasons };
}

function getMatchField(
  lead: Record<string, string | null>,
  matchType: string,
): string | null {
  switch (matchType) {
    case "name":
      return lead.company_name ?? null;
    case "domain":
      // Match-Type-String "domain" bleibt aus Backwards-Compat-Gründen erhalten
      // (Blacklist-Einträge sind so in der DB persistiert). Die Datenquelle ist
      // aber das umbenannte `website`-Feld des Leads.
      return lead.website ?? null;
    case "register_id":
      return lead.register_id ?? null;
    default:
      return null;
  }
}

// Rechtsformen einer Kapitalgesellschaft — das "Konzern-Signal" für name-Treffer.
// Token-Gleichheit (kein Substring) → "Tagespflege" enthält kein "ag". Zentral &
// leicht erweiterbar.
const CORPORATE_LEGAL_FORMS = new Set([
  "ag", "se", "kgaa", "gmbh", "mbh", "ggmbh", "ug", "kg", "ohg",
  "ltd", "plc", "inc", "sa", "nv", "bv", "srl", "spa",
]);

/**
 * Zerlegt einen Namen in normalisierte Tokens.
 * - lowercase (Unicode-/Umlaut-sicher; KEINE Diakritika-Entfernung)
 * - stripParens (nur Firmenname-Seite): `(...)`-Segmente entfernen → schneidet den
 *   in Klammern angehängten Inhaber weg ("… (Rebekka Wildenmann-Henkel)").
 * - Split auf alles außer Buchstaben/Ziffern UND Bindestrich → interner Bindestrich
 *   bleibt erhalten, "wildenmann-henkel" ist EIN Token (≠ "henkel").
 */
function tokenize(raw: string, stripParens: boolean): string[] {
  let s = raw.toLowerCase();
  if (stripParens) s = s.replace(/\([^)]*\)/g, " ").replace(/[()]/g, " ");
  return s
    .split(/[^\p{L}\p{N}-]+/u)
    .map((t) => t.replace(/^-+|-+$/g, ""))
    .filter((t) => t.length > 0);
}

function hasCorporateLegalForm(tokens: string[]): boolean {
  return tokens.some((t) => CORPORATE_LEGAL_FORMS.has(t));
}

/**
 * Firmenname-Blacklist-Match für die Konzern-Filterung.
 * Trifft nur, wenn (1) der Firmenname eine Rechtsform einer Kapitalgesellschaft
 * trägt UND (2) der Eintragswert als zusammenhängende ganze Wortfolge im Namen
 * vorkommt. Exportiert für Unit-Tests.
 */
export function matchesCompanyName(companyName: string, entryValue: string): boolean {
  const company = tokenize(companyName, true);
  const entry = tokenize(entryValue, false);
  if (company.length === 0 || entry.length === 0) return false;

  // Konzern-Gate: ohne Rechtsform kein Treffer (Einzelunternehmen etc. bleiben drin).
  if (!hasCorporateLegalForm(company)) return false;

  // Marke als konsekutiver Token-Lauf (Phrase, richtige Reihenfolge, Token-Gleichheit).
  for (let i = 0; i + entry.length <= company.length; i++) {
    let ok = true;
    for (let j = 0; j < entry.length; j++) {
      if (company[i + j] !== entry[j]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}
