"use client";

import Link from "next/link";
import type { PeriodView } from "@/lib/zeit/reports";

const VIEWS: { id: PeriodView; label: string }[] = [
  { id: "day", label: "Tag" },
  { id: "week", label: "Woche" },
  { id: "month", label: "Monat" },
  { id: "year", label: "Jahr" },
];

export function PeriodTabs({ basePath, current }: { basePath: string; current: PeriodView }) {
  return (
    <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#161618]">
      {VIEWS.map((v) => {
        const active = v.id === current;
        return (
          <Link
            key={v.id}
            href={`${basePath}?view=${v.id}`}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${
              active
                ? "bg-primary text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
            }`}
          >
            {v.label}
          </Link>
        );
      })}
    </div>
  );
}
