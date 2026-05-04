/**
 * Helper rund um die Web-Adresse eines Leads. Single Source of Truth ist
 * `lead.website` — Anzeige-Links werden zur Render-Zeit als `https://${website}`
 * konstruiert. Subpages für Karriereseiten leben in `lead.career_page_url`.
 */

/** Liefert die Homepage-URL eines Leads oder null, wenn keine Website hinterlegt. */
export function leadHomepageUrl(lead: { website: string | null }): string | null {
  return lead.website ? `https://${lead.website}` : null;
}

/** Extrahiert die nackte Domain aus einer beliebigen URL/Eingabe.
 *  Liefert null bei leerer Eingabe oder unparsbarer URL. */
export function extractDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withScheme);
    return parsed.hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}
