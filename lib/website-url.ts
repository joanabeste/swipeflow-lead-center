/**
 * Normalisiert ein gespeichertes Website-Feld zu einer klickbaren HTTPS-URL.
 *
 * Hintergrund: `leads.website` enthaelt historisch gemischte Werte —
 *   "example.com"          → "https://example.com"
 *   "www.example.com"      → "https://www.example.com"
 *   "http://example.com"   → "https://example.com"    (Protokoll-Upgrade)
 *   "https://example.com"  → "https://example.com"
 * Ohne Normalisierung wurde frueher blind `https://${lead.website}` gebaut, was
 * bei bereits vorhandenem Protokoll zu kaputten Links wie
 * "https://http://example.com" fuehrte.
 *
 * Liefert null, wenn der Wert leer/whitespace ist.
 */
export function normalizeWebsiteUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Existing protocol entfernen (case-insensitive), egal ob http/https/ftp/...
  const stripped = trimmed.replace(/^[a-z]+:\/\//i, "");
  if (!stripped) return null;
  return `https://${stripped}`;
}
