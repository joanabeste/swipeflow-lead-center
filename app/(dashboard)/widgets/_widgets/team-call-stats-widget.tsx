"use client";

import { useMemo, useState } from "react";
import { Phone } from "lucide-react";
import type { DashboardData } from "../data";
import { Card } from "./shared";

type Range = "7" | "30" | "90";

/**
 * Anrufe pro Nutzer + Team-Gesamt, umschaltbar 7/30/90 Tage.
 * Daten kommen vor-aggregiert aus DashboardData.teamCallStats.
 */
export function TeamCallStatsWidget({ data }: { data: DashboardData }) {
  const [range, setRange] = useState<Range>("30");

  const { rows, total, maxTotal } = useMemo(() => {
    const key = range === "7" ? "d7" : range === "30" ? "d30" : "d90";
    const ranked = data.teamCallStats
      .map((u) => ({ userId: u.userId, name: u.name, count: u[key] as number }))
      .filter((u) => u.count > 0)
      .sort((a, b) => b.count - a.count);
    const sum = ranked.reduce((s, u) => s + u.count, 0);
    return { rows: ranked, total: sum, maxTotal: Math.max(1, ...ranked.map((u) => u.count)) };
  }, [data.teamCallStats, range]);

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Phone className="h-3.5 w-3.5 text-emerald-500" />
          Team — Anrufe pro Nutzer
        </h2>
        <div className="flex rounded-md border border-gray-200 p-0.5 text-xs dark:border-[#2c2c2e]">
          {(["7", "30", "90"] as const).map((r) => {
            const active = range === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`rounded px-2 py-0.5 ${
                  active
                    ? "bg-gray-200 font-medium dark:bg-white/10"
                    : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                {r} Tage
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-1 text-xs text-gray-400">
        {total} Anrufe gesamt · letzte {range} Tage
      </p>

      <div className="mt-4 space-y-2.5">
        {rows.length === 0 && (
          <p className="py-4 text-center text-sm text-gray-400">
            Keine Anrufe in diesem Zeitraum.
          </p>
        )}
        {rows.map((r, i) => {
          const pct = (r.count / maxTotal) * 100;
          return (
            <div key={r.userId} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="w-4 text-right text-gray-400">{i + 1}.</span>
                  <span className="truncate font-medium">{r.name}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                  {r.count}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-[#2c2c2e]">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
