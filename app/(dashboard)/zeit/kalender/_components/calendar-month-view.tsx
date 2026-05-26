import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Absence, TimeEntry } from "@/lib/zeit/types";
import { getHolidaysInRange } from "@/lib/zeit/holidays";
import { formatHours } from "@/lib/zeit/format";
import { dateKeyInAppTz } from "@/lib/zeit/timezone";

interface Props {
  year: number;
  month: number; // 0-11
  entries: TimeEntry[];
  absences: Absence[];
  basePath?: string;
}

const DOW = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export function CalendarMonthView({ year, month, entries, absences, basePath = "/zeit/kalender" }: Props) {
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 1);
  const holidays = getHolidaysInRange(monthStart, monthEnd);

  // Grid: ab Montag der Woche, in der der Monatsanfang liegt.
  const firstDow = monthStart.getDay() === 0 ? 7 : monthStart.getDay();
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - (firstDow - 1));
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push(d);
  }

  const entriesByDay = new Map<string, TimeEntry[]>();
  for (const e of entries) {
    if (!e.ended_at) continue;
    // Eintrag zum Berliner Kalendertag zuordnen, nicht zum Server-UTC-Tag.
    // Ohne diese Korrektur landet ein Eintrag um 00:30 Berlin (22:30 UTC Vortag)
    // auf der falschen Kachel im Kalender.
    const k = dateKeyInAppTz(new Date(e.started_at));
    const list = entriesByDay.get(k) ?? [];
    list.push(e);
    entriesByDay.set(k, list);
  }

  const absenceByDay = new Map<string, Absence>();
  for (const a of absences) {
    if (a.status !== "approved") continue;
    const start = new Date(a.date_from + "T00:00:00");
    const end = new Date(a.date_to + "T00:00:00");
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      absenceByDay.set(dateKey(d), a);
    }
  }

  const prev = new Date(year, month - 1, 1);
  const next = new Date(year, month + 1, 1);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href={`${basePath}?year=${prev.getFullYear()}&month=${prev.getMonth() + 1}`} className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-white/5">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {monthStart.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}
          </h2>
          {!isCurrentMonth && (
            <Link
              href={`${basePath}?year=${today.getFullYear()}&month=${today.getMonth() + 1}`}
              className="rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:border-[#2c2c2e]/60 dark:text-gray-300 dark:hover:bg-white/5"
            >
              Heute
            </Link>
          )}
        </div>
        <Link href={`${basePath}?year=${next.getFullYear()}&month=${next.getMonth() + 1}`} className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-white/5">
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
        <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:border-[#2c2c2e]/40 dark:bg-[#1c1c1e]">
          {DOW.map((d) => <div key={d} className="px-2 py-2 text-center">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            const k = dateKey(d);
            const inMonth = d.getMonth() === month;
            const dow = d.getDay();
            const isWeekend = dow === 0 || dow === 6;
            const holiday = holidays.get(k);
            const absence = absenceByDay.get(k);
            const dayEntries = entriesByDay.get(k) ?? [];
            const totalSec = dayEntries.reduce((acc, e) => {
              const s = new Date(e.started_at).getTime();
              const en = new Date(e.ended_at!).getTime();
              return acc + Math.max(0, Math.round((en - s) / 1000));
            }, 0);

            return (
              <div
                key={i}
                className={`min-h-[100px] border-b border-r border-gray-100 p-2 text-xs dark:border-[#2c2c2e]/40 ${
                  !inMonth ? "bg-gray-50/50 text-gray-400 dark:bg-[#0e0e10]" : isWeekend ? "bg-gray-50/30 dark:bg-[#141416]" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`font-semibold ${holiday ? "text-red-500" : "text-gray-700 dark:text-gray-200"}`}>
                    {d.getDate()}
                  </span>
                  {absence && (
                    <span className={`rounded px-1 text-[9px] font-bold uppercase ${
                      absence.type === "vacation" ? "bg-blue-100 text-blue-700" :
                      absence.type === "sick" ? "bg-red-100 text-red-700" : "bg-gray-200 text-gray-700"
                    }`}>
                      {absence.type === "vacation" ? "U" : absence.type === "sick" ? "K" : "F"}
                    </span>
                  )}
                </div>
                {holiday && <p className="mt-1 text-[10px] text-red-500">{holiday}</p>}
                {totalSec > 0 && (
                  <p className="mt-1 font-mono text-[11px] text-primary">{formatHours(totalSec)} h</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
