import { toBerlinDayKey } from "@/lib/date/day-key";

/** Aktueller Monat als `YYYY-MM` in Europe/Berlin. */
export function currentMonth(): string {
  return toBerlinDayKey(new Date()).slice(0, 7);
}

/** Validiert `YYYY-MM` mit Monat 01–12; sonst null. */
export function normalizeMonth(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return raw;
}
