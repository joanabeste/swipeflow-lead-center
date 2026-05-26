export function formatHours(seconds: number): string {
  if (seconds > 0 && seconds < 60) return "<1 min";
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

export function formatHoursDecimal(seconds: number): string {
  return (seconds / 3600).toFixed(2);
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

import { APP_TIMEZONE } from "@/lib/zeit/timezone";

// timeZone: APP_TIMEZONE garantiert, dass Server (UTC) und Client (Browser-TZ)
// dasselbe ausgeben. Damit keine Hydration-Mismatches und CSVs/Server-gerenderte
// Komponenten zeigen Berliner Zeit, nicht UTC.

export function formatDateDe(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("de-DE", {
    timeZone: APP_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatTimeDe(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("de-DE", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Kurzes Tages-Label "dd.mm." aus einem Berlin-Datums-Key. */
export function formatDayMonthDe(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const noon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return noon.toLocaleDateString("de-DE", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
  });
}

/** Wochentag + Datum, z. B. "Di., 26.05.2026". Nimmt einen Berlin-Datums-Key. */
export function formatWeekdayDateDe(dateKey: string): string {
  // dateKey ist bereits ein Berlin-Kalendertag. Wir bauen einen UTC-Mittag
  // daraus (irgendeine Uhrzeit innerhalb des Tages) und formatieren in UTC, um
  // DST-Sprung-Tage robust zu treffen.
  const [y, m, d] = dateKey.split("-").map(Number);
  const noon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return noon.toLocaleDateString("de-DE", {
    timeZone: "UTC",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function toDatetimeLocalValue(date: Date): string {
  // Wird ausschliesslich client-side (datetime-local Input) benutzt → Browser-TZ ist korrekt.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
