import { timingSafeEqual } from "node:crypto";

/**
 * Bearer-Auth für die externen Lead-APIs (Import + Lesen/Updaten).
 *
 * Alle Routen unter `/api/leads` (außer den session-authentifizierten
 * `[id]/preview|geocode|screenshot-url`) sind in proxy.ts vom Session-Gate
 * ausgenommen und authentifizieren sich selbst über diesen timing-safen Vergleich
 * gegen `LEADS_IMPORT_API_KEY`.
 */
export function authorizeLeadsApi(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = process.env.LEADS_IMPORT_API_KEY;
  if (!expected) return false;
  const got = header.startsWith("Bearer ") ? header.slice(7) : "";
  // timingSafeEqual wirft bei Laengendifferenz → vorher abfangen.
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
