// Zeit-Aggregation, portiert aus Swipeflow Time Tracking.
// Reine Funktion ueber TimeEntry + Absence + Schedule — keine DB-Abhaengigkeit.

import type { BreakMode } from "@/lib/types";
import type { Absence, DailySchedule, TimeEntry } from "@/lib/zeit/types";
import { getHolidaysInRange } from "@/lib/zeit/holidays";
import {
  APP_TIMEZONE,
  addDaysToStartOfDayInAppTz,
  addMonthsToStartOfMonthInAppTz,
  dateKeyInAppTz,
  getDayOfWeekInAppTz,
  startOfDayInAppTz,
  startOfDayInAppTzFromDateKey,
  startOfMonthInAppTz,
  startOfYearInAppTz,
} from "@/lib/zeit/timezone";

export interface DailyTotal {
  date: string;
  seconds: number;
  entries: number;
}

export interface PeriodReport {
  totalSeconds: number;
  byDay: DailyTotal[];
}

export interface DaySegment {
  id: string;
  startsAt: Date;
  endsAt: Date;
  seconds: number;
  note: string | null;
}

export type PeriodView = "day" | "week" | "month" | "year";

export function isPeriodView(s: string | undefined): s is PeriodView {
  return s === "day" || s === "week" || s === "month" || s === "year";
}

// Alle Range-Helper liefern UTC-Instants, die Tagesgrenzen in Europe/Berlin
// repraesentieren. Wichtig, weil der Server in UTC laeuft, aber Tagesgrenzen
// (z. B. „heute") aus Nutzersicht in Berlin gelten muessen.

export function getDayRange(date: Date = new Date()): { from: Date; to: Date } {
  const from = startOfDayInAppTz(date);
  const to = addDaysToStartOfDayInAppTz(from, 1);
  return { from, to };
}

export function getMonthRange(date: Date = new Date()): { from: Date; to: Date } {
  const from = startOfMonthInAppTz(date);
  const to = addMonthsToStartOfMonthInAppTz(from, 1);
  return { from, to };
}

export function getWeekRange(date: Date = new Date()): { from: Date; to: Date } {
  const dow = getDayOfWeekInAppTz(date); // 0=So..6=Sa
  const offsetFromMonday = dow === 0 ? 6 : dow - 1;
  const startOfRefDay = startOfDayInAppTz(date);
  const monday = addDaysToStartOfDayInAppTz(startOfRefDay, -offsetFromMonday);
  const nextMonday = addDaysToStartOfDayInAppTz(monday, 7);
  return { from: monday, to: nextMonday };
}

export function getYearRange(date: Date = new Date()): { from: Date; to: Date } {
  const from = startOfYearInAppTz(date);
  const to = addMonthsToStartOfMonthInAppTz(from, 12);
  return { from, to };
}

export function getRangeFor(view: PeriodView, date: Date = new Date()) {
  switch (view) {
    case "day": return getDayRange(date);
    case "week": return getWeekRange(date);
    case "month": return getMonthRange(date);
    case "year": return getYearRange(date);
  }
}

// Tages-Key in Europe/Berlin. Vorher: server-lokal (= UTC auf Vercel) → Eintraege
// kurz nach Berliner Mitternacht landeten beim Vortag. Jetzt konsistent Berlin.
const localDateKey = dateKeyInAppTz;

/** Mindest-Pause nach §4 ArbZG: <=6h → 0min, >6 und <=9h → 30min, >9h → 45min. */
export function requiredBreakSeconds(grossSeconds: number): number {
  if (grossSeconds <= 6 * 3600) return 0;
  if (grossSeconds <= 9 * 3600) return 30 * 60;
  return 45 * 60;
}

export function aggregateEntries(entries: TimeEntry[], breakMode: BreakMode = "manual"): PeriodReport {
  const intervalsByDay = new Map<string, Array<{ start: number; end: number }>>();
  const countsByDay = new Map<string, number>();

  for (const e of entries) {
    if (!e.ended_at) continue;
    const start = new Date(e.started_at);
    const end = new Date(e.ended_at);
    const key = localDateKey(start);
    const list = intervalsByDay.get(key) ?? [];
    list.push({ start: start.getTime(), end: end.getTime() });
    intervalsByDay.set(key, list);
    countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
  }

  let total = 0;
  const byDay: DailyTotal[] = [];

  for (const [date, intervals] of [...intervalsByDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    intervals.sort((a, b) => a.start - b.start);
    const gross = intervals.reduce((acc, iv) => acc + Math.max(0, Math.round((iv.end - iv.start) / 1000)), 0);

    let net = gross;
    if (breakMode === "auto_deduct") {
      let gapSeconds = 0;
      for (let i = 1; i < intervals.length; i++) {
        gapSeconds += Math.max(0, Math.round((intervals[i]!.start - intervals[i - 1]!.end) / 1000));
      }
      const required = requiredBreakSeconds(gross);
      const missing = Math.max(0, required - gapSeconds);
      net = Math.max(0, gross - missing);
    }

    total += net;
    byDay.push({ date, seconds: net, entries: countsByDay.get(date) ?? 0 });
  }

  return { totalSeconds: total, byDay };
}

export function entriesAsSegments(entries: TimeEntry[], now: Date = new Date()): DaySegment[] {
  return entries
    .map((e) => {
      const startsAt = new Date(e.started_at);
      const endsAt = e.ended_at ? new Date(e.ended_at) : now;
      const seconds = Math.max(0, Math.round((endsAt.getTime() - startsAt.getTime()) / 1000));
      return { id: e.id, startsAt, endsAt, seconds, note: e.note };
    })
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export function countWorkdaysInAbsences(
  absences: Absence[],
  from: Date,
  to: Date,
  type: Absence["type"] = "vacation",
): number {
  const holidays = getHolidaysInRange(from, to);
  let days = 0;
  for (const a of absences) {
    if (a.status !== "approved" || a.type !== type) continue;
    const aStart = startOfDayInAppTzFromDateKey(a.date_from);
    const aEnd = addDaysToStartOfDayInAppTz(startOfDayInAppTzFromDateKey(a.date_to), 1);
    const start = aStart < from ? from : aStart;
    const end = aEnd > to ? to : aEnd;
    for (let d = start; d < end; d = addDaysToStartOfDayInAppTz(d, 1)) {
      const dow = getDayOfWeekInAppTz(d);
      if (dow === 0 || dow === 6) continue;
      const key = localDateKey(d);
      if (holidays.has(key)) continue;
      days += 1;
    }
  }
  return days;
}

export function targetSecondsInRange(
  schedule: DailySchedule,
  from: Date,
  to: Date,
  absences: Absence[] = [],
): number {
  const dowToHours = [schedule.sun, schedule.mon, schedule.tue, schedule.wed, schedule.thu, schedule.fri, schedule.sat];
  const holidays = getHolidaysInRange(from, to);

  const absenceDays = new Set<string>();
  for (const a of absences) {
    if (a.status !== "approved") continue;
    const aStart = startOfDayInAppTzFromDateKey(a.date_from);
    const aEnd = addDaysToStartOfDayInAppTz(startOfDayInAppTzFromDateKey(a.date_to), 1);
    const s = aStart < from ? from : aStart;
    const e = aEnd > to ? to : aEnd;
    for (let d = s; d < e; d = addDaysToStartOfDayInAppTz(d, 1)) {
      absenceDays.add(localDateKey(d));
    }
  }

  let totalHours = 0;
  for (let d = from; d < to; d = addDaysToStartOfDayInAppTz(d, 1)) {
    const key = localDateKey(d);
    if (holidays.has(key)) continue;
    if (absenceDays.has(key)) continue;
    totalHours += dowToHours[getDayOfWeekInAppTz(d)] ?? 0;
  }
  return Math.round(totalHours * 3600);
}

export function entriesToCSV(entries: TimeEntry[], userMap?: Map<string, string>): string {
  const header = ["Datum", "Start", "Ende", "Dauer (h)", "Notiz"];
  if (userMap) header.unshift("Mitarbeiter");
  const rows = entries
    .filter((e) => e.ended_at)
    .map((e) => {
      const start = new Date(e.started_at);
      const end = new Date(e.ended_at!);
      const seconds = Math.round((end.getTime() - start.getTime()) / 1000);
      const hours = (seconds / 3600).toFixed(2);
      const note = (e.note ?? "").replace(/"/g, '""');
      const cells = [
        start.toLocaleDateString("de-DE", { timeZone: APP_TIMEZONE }),
        start.toLocaleTimeString("de-DE", { timeZone: APP_TIMEZONE, hour: "2-digit", minute: "2-digit" }),
        end.toLocaleTimeString("de-DE", { timeZone: APP_TIMEZONE, hour: "2-digit", minute: "2-digit" }),
        hours,
        `"${note}"`,
      ];
      if (userMap) cells.unshift(`"${(userMap.get(e.user_id) ?? e.user_id).replace(/"/g, '""')}"`);
      return cells.join(";");
    });
  return [header.join(";"), ...rows].join("\n");
}
