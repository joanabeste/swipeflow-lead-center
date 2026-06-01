"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PostWithMedia } from "@/lib/social/types";
import { MediaThumb, PlatformIcons } from "./post-ui";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function CalendarView({ posts, onEdit }: { posts: PostWithMedia[]; onEdit: (p: PostWithMedia) => void }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const byDay = new Map<string, PostWithMedia[]>();
  const undated: PostWithMedia[] = [];
  for (const p of posts) {
    if (!p.scheduled_at) {
      undated.push(p);
      continue;
    }
    const key = localDateKey(new Date(p.scheduled_at));
    const arr = byDay.get(key) ?? [];
    arr.push(p);
    byDay.set(key, arr);
  }

  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Mo=0 … So=6
  const leading = (first.getDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const todayKey = localDateKey(today);

  function shift(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3 dark:border-[#2c2c2e]/60 dark:bg-[#161618]">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {MONTHS[month]} {year}
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}
            className="rounded-lg px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
          >
            Heute
          </button>
          <button type="button" onClick={() => shift(-1)} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => shift(1)} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-1 pb-1 text-center text-[11px] font-medium uppercase text-gray-400">
            {w}
          </div>
        ))}
        {cells.map((day, idx) => {
          if (day === null) return <div key={`e-${idx}`} className="min-h-[88px] rounded-lg bg-gray-50/40 dark:bg-white/[0.015]" />;
          const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayPosts = byDay.get(key) ?? [];
          const isToday = key === todayKey;
          return (
            <div
              key={key}
              className={`min-h-[88px] rounded-lg border p-1 ${
                isToday ? "border-primary/50 bg-primary/5" : "border-gray-100 dark:border-[#2c2c2e]/50"
              }`}
            >
              <p className={`mb-1 px-0.5 text-[11px] font-medium ${isToday ? "text-primary" : "text-gray-400"}`}>{day}</p>
              <div className="space-y-1">
                {dayPosts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onEdit(p)}
                    className="flex w-full items-center gap-1 rounded-md border border-gray-200 bg-white px-1 py-0.5 text-left hover:border-primary dark:border-[#2c2c2e] dark:bg-[#1c1c1e]"
                    title={p.title?.trim() || p.caption.trim() || "Ohne Titel"}
                  >
                    <MediaThumb media={p.media[0]} className="h-5 w-5 shrink-0 rounded" />
                    <span className="min-w-0 flex-1 truncate text-[11px] text-gray-700 dark:text-gray-200">
                      {p.title?.trim() || p.caption.trim() || "Ohne Titel"}
                    </span>
                    <PlatformIcons platforms={p.platforms} />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {undated.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-3 dark:border-[#2c2c2e]/50">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-400">Ohne Termin</p>
          <div className="flex flex-wrap gap-1.5">
            {undated.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onEdit(p)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs hover:border-primary dark:border-[#2c2c2e] dark:bg-[#1c1c1e]"
              >
                <MediaThumb media={p.media[0]} className="h-5 w-5 shrink-0 rounded" />
                <span className="max-w-[160px] truncate text-gray-700 dark:text-gray-200">
                  {p.title?.trim() || p.caption.trim() || "Ohne Titel"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
