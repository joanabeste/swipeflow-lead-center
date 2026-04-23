/**
 * Wandelt ein Datum in einen Tages-Key `YYYY-MM-DD` in Europe/Berlin um.
 *
 * Warum nicht `toISOString().slice(0, 10)`? Das würde den UTC-Tag liefern;
 * in CEST (UTC+2) liegt lokale Mitternacht bei 22:00 UTC des Vortages, und
 * Tages-Buckets würden gegen die UTC-Datumsgrenze statt gegen die lokale
 * Mitternacht geführt — Anrufe zwischen 00:00 und ~02:00 UTC (morgens in DE)
 * landen sonst im falschen Bucket oder fallen ganz raus.
 */
const BERLIN_DATE_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function toBerlinDayKey(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  // `en-CA` formatiert als `YYYY-MM-DD` — exakt das Format, das wir für
  // Bucket-Keys brauchen, ohne String-Manipulation.
  return BERLIN_DATE_FMT.format(d);
}
