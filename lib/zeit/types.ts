// Zeit-Modul (portiert aus Swipeflow Time Tracking).
// User-Stammdaten leben weiter in der zentralen profiles-Tabelle (siehe lib/types.ts);
// hier nur die zeit-spezifischen Entitaeten.

import type { BreakMode, Profile } from "@/lib/types";

export type AbsenceType = "vacation" | "sick" | "other";
export type AbsenceStatus = "pending" | "approved" | "rejected";

export interface TimeEntry {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  note: string | null;
  lead_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Absence {
  id: string;
  user_id: string;
  type: AbsenceType;
  date_from: string;
  date_to: string;
  status: AbsenceStatus;
  note: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailySchedule {
  mon: number;
  tue: number;
  wed: number;
  thu: number;
  fri: number;
  sat: number;
  sun: number;
}

export const DEFAULT_SCHEDULE: DailySchedule = { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 0, sun: 0 };
export const DEFAULT_VACATION_DAYS = 30;
export const DEFAULT_BREAK_MODE: BreakMode = "manual";

export function scheduleFromProfile(p: Pick<Profile,
  "hours_mon" | "hours_tue" | "hours_wed" | "hours_thu" | "hours_fri" | "hours_sat" | "hours_sun"
>): DailySchedule {
  return {
    mon: numOrDefault(p.hours_mon, DEFAULT_SCHEDULE.mon),
    tue: numOrDefault(p.hours_tue, DEFAULT_SCHEDULE.tue),
    wed: numOrDefault(p.hours_wed, DEFAULT_SCHEDULE.wed),
    thu: numOrDefault(p.hours_thu, DEFAULT_SCHEDULE.thu),
    fri: numOrDefault(p.hours_fri, DEFAULT_SCHEDULE.fri),
    sat: numOrDefault(p.hours_sat, DEFAULT_SCHEDULE.sat),
    sun: numOrDefault(p.hours_sun, DEFAULT_SCHEDULE.sun),
  };
}

export function weeklyHoursFromSchedule(s: DailySchedule): number {
  return s.mon + s.tue + s.wed + s.thu + s.fri + s.sat + s.sun;
}

export function breakModeFromProfile(p: Pick<Profile, "break_mode">): BreakMode {
  return p.break_mode ?? DEFAULT_BREAK_MODE;
}

export function vacationDaysFromProfile(p: Pick<Profile, "vacation_days_per_year">): number {
  return numOrDefault(p.vacation_days_per_year, DEFAULT_VACATION_DAYS);
}

function numOrDefault(v: number | null | undefined, fallback: number): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : fallback;
}
