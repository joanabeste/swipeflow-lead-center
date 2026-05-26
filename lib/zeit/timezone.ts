// Feste App-Zeitzone fuer Server-side Datum-Logik. Der Server (Vercel) laeuft
// in UTC, alle Nutzer der App sind aber in Deutschland — daher rechnen wir
// Tagesgrenzen, Wochengrenzen und Datums-Keys konsistent in Europe/Berlin.
//
// Alle Helper sind DST-sicher (uebergangstage), weil sie sich auf
// `Intl.DateTimeFormat` mit `timeZone` stuetzen und nicht auf festen UTC-Offset.

export const APP_TIMEZONE = "Europe/Berlin";

interface AppTzParts {
  year: number;
  month: number; // 1..12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function partsInAppTz(d: Date): AppTzParts {
  const parts = partsFormatter.formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  // hour: "2-digit", hour12: false liefert in einigen Engines "24" fuer Mitternacht.
  let hour = get("hour");
  if (hour === 24) hour = 0;
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour,
    minute: get("minute"),
    second: get("second"),
  };
}

/** UTC-Instant fuer eine gegebene Berlin-Wanduhrzeit. Akzeptiert Ueberlauf
 *  (z. B. day=32, month=13) und normalisiert via Date.UTC. DST-Sprung-Stunden:
 *  doppelte/nicht-existente Stunden werden konsistent auf den Vor-Sprung-Offset
 *  abgebildet — fuer Tagesgrenzen irrelevant. */
function utcFromAppTzClock(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): Date {
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const probe = partsInAppTz(new Date(asIfUtc));
  const probeAsIfUtc = Date.UTC(probe.year, probe.month - 1, probe.day, probe.hour, probe.minute, probe.second);
  const offset = probeAsIfUtc - asIfUtc;
  return new Date(asIfUtc - offset);
}

/** Tagesanfang (00:00 Berlin) als UTC-Instant fuer den Berlin-Kalendertag,
 *  in dem `ref` liegt. */
export function startOfDayInAppTz(ref: Date = new Date()): Date {
  const p = partsInAppTz(ref);
  return utcFromAppTzClock(p.year, p.month, p.day, 0, 0, 0);
}

/** ISO-Datum "YYYY-MM-DD" fuer den Berlin-Kalendertag, in dem `d` liegt. */
export function dateKeyInAppTz(d: Date): string {
  const p = partsInAppTz(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Wochentag 0=So..6=Sa fuer den Berlin-Kalendertag, in dem `d` liegt. */
export function getDayOfWeekInAppTz(d: Date): number {
  const p = partsInAppTz(d);
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

/** Monatsanfang (1. Tag, 00:00 Berlin) als UTC-Instant. */
export function startOfMonthInAppTz(ref: Date = new Date()): Date {
  const p = partsInAppTz(ref);
  return utcFromAppTzClock(p.year, p.month, 1, 0, 0, 0);
}

/** Jahresanfang (1.1., 00:00 Berlin) als UTC-Instant. */
export function startOfYearInAppTz(ref: Date = new Date()): Date {
  const p = partsInAppTz(ref);
  return utcFromAppTzClock(p.year, 1, 1, 0, 0, 0);
}

/** UTC-Instant fuer 00:00 Berlin eines gegebenen ISO-Datums "YYYY-MM-DD". */
export function startOfDayInAppTzFromDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return utcFromAppTzClock(y, m, d, 0, 0, 0);
}

/** Liefert ein neues UTC-Datum, das in Berlin um `days` Kalendertage nach
 *  Mitternacht von `ref` liegt (00:00 Berlin). DST-sicher. */
export function addDaysToStartOfDayInAppTz(ref: Date, days: number): Date {
  const p = partsInAppTz(ref);
  return utcFromAppTzClock(p.year, p.month, p.day + days, 0, 0, 0);
}

/** Liefert ein neues UTC-Datum, das in Berlin um `months` Kalendermonate nach
 *  dem ersten Tag des Monats von `ref` liegt (00:00 Berlin). */
export function addMonthsToStartOfMonthInAppTz(ref: Date, months: number): Date {
  const p = partsInAppTz(ref);
  return utcFromAppTzClock(p.year, p.month + months, 1, 0, 0, 0);
}
