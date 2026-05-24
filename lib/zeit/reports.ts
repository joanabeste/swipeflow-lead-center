// Zeit-Aggregation, portiert aus Swipeflow Time Tracking.
// Reine Funktion ueber TimeEntry + Absence + Schedule — keine DB-Abhaengigkeit.

import type { BreakMode } from "@/lib/types";
import type { Absence, DailySchedule, TimeEntry } from "@/lib/zeit/types";
import { getHolidaysInRange } from "@/lib/zeit/holidays";

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

export function getDayRange(date: Date = new Date()): { from: Date; to: Date } {
  const from = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from, to };
}

export function getMonthRange(date: Date = new Date()): { from: Date; to: Date } {
  const from = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  const to = new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
  return { from, to };
}

export function getWeekRange(date: Date = new Date()): { from: Date; to: Date } {
  const d = new Date(date);
  const day = d.getDay() === 0 ? 7 : d.getDay();
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (day - 1), 0, 0, 0, 0);
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  return { from: monday, to: nextMonday };
}

export function getYearRange(date: Date = new Date()): { from: Date; to: Date } {
  const from = new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0);
  const to = new Date(date.getFullYear() + 1, 0, 1, 0, 0, 0, 0);
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

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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
    const aStart = new Date(a.date_from + "T00:00:00");
    const aEnd = new Date(a.date_to + "T00:00:00");
    aEnd.setDate(aEnd.getDate() + 1);
    const start = aStart < from ? from : aStart;
    const end = aEnd > to ? to : aEnd;
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
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
    const aStart = new Date(a.date_from + "T00:00:00");
    const aEnd = new Date(a.date_to + "T00:00:00");
    aEnd.setDate(aEnd.getDate() + 1);
    const s = aStart < from ? from : aStart;
    const e = aEnd > to ? to : aEnd;
    for (const d = new Date(s); d < e; d.setDate(d.getDate() + 1)) {
      absenceDays.add(localDateKey(d));
    }
  }

  let totalHours = 0;
  for (const d = new Date(from); d < to; d.setDate(d.getDate() + 1)) {
    const key = localDateKey(d);
    if (holidays.has(key)) continue;
    if (absenceDays.has(key)) continue;
    totalHours += dowToHours[d.getDay()] ?? 0;
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
        start.toLocaleDateString("de-DE"),
        start.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
        end.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
        hours,
        `"${note}"`,
      ];
      if (userMap) cells.unshift(`"${(userMap.get(e.user_id) ?? e.user_id).replace(/"/g, '""')}"`);
      return cells.join(";");
    });
  return [header.join(";"), ...rows].join("\n");
}
