"use client";

import { useMemo, useState } from "react";
import { PhoneCall } from "lucide-react";
import type { DashboardData } from "./data";

type Range = "7" | "30" | "90";

/**
 * Filterbare Anruf-Trends.
 * Nutzt die 90-Tage-Rohdaten aus DashboardData und filtert/bündelt clientseitig:
 *   - 7 Tage:  7 tägliche Balken
 *   - 30 Tage: 30 tägliche Balken (dünner)
 *   - 90 Tage: ~13 wöchentliche Balken (sonst zu dünn zum Hovern)
 */
export function CallTrendsWidget({ data }: { data: DashboardData }) {
  const [range, setRange] = useState<Range>("30");

  const { bars, total, outbound, inbound, missed } = useMemo(() => {
    const days = parseInt(range, 10);
    const slice = data.callsByDay90.slice(-days);

    let totalOut = 0, totalIn = 0, totalMiss = 0;
    for (const d of slice) {
      totalOut += d.outbound;
      totalIn += d.inbound;
      totalMiss += d.missed;
    }

    // 90 Tage → wöchentlich bündeln. Ältester Balken = älteste Woche.
    if (range === "90") {
      const weekly: Array<{ label: string; outbound: number; inbound: number; missed: number }> = [];
      for (let i = 0; i < slice.length; i += 7) {
        const chunk = slice.slice(i, i + 7);
        if (chunk.length === 0) continue;
        const sum = chunk.reduce(
          (acc, d) => ({
            outbound: acc.outbound + d.outbound,
            inbound: acc.inbound + d.inbound,
            missed: acc.missed + d.missed,
          }),
          { outbound: 0, inbound: 0, missed: 0 },
        );
        // Label: KW des ersten Tages der Woche, z. B. "KW 18"
        weekly.push({
          label: `KW ${isoWeek(new Date(chunk[0].date))}`,
          ...sum,
        });
      }
      return {
        bars: weekly,
        total: totalOut + totalIn + totalMiss,
        outbound: totalOut,
        inbound: totalIn,
        missed: totalMiss,
      };
    }

    // 7 / 30 Tage → täglich
    return {
      bars: slice.map((d) => ({
        label: daysBackLabel(d.date, days),
        outbound: d.outbound,
        inbound: d.inbound,
        missed: d.missed,
      })),
      total: totalOut + totalIn + totalMiss,
      outbound: totalOut,
      inbound: totalIn,
      missed: totalMiss,
    };
  }, [data.callsByDay90, range]);

  const maxBar = Math.max(1, ...bars.map((b) => b.outbound + b.inbound + b.missed));

  return (
    <div className="h-full rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400">
            <PhoneCall className="h-3.5 w-3.5 text-emerald-500" />
            Anrufe-Trend
          </p>
          <p className="mt-0.5 text-lg font-bold">
            {total} gesamt
            <span className="ml-2 text-xs font-normal text-gray-500">
              · {outbound} ausgehend · {inbound} eingehend · {missed} verpasst
            </span>
          </p>
        </div>
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

      <div className="mt-5 flex h-32 items-end gap-1">
        {bars.map((b, i) => {
          const sum = b.outbound + b.inbound + b.missed;
          const h = (sum / maxBar) * 100;
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-col justify-end" style={{ height: "7rem" }}>
                <div
                  className="flex w-full flex-col overflow-hidden rounded-t-md"
                  style={{ height: `${h}%` }}
                >
                  {b.outbound > 0 && (
                    <div
                      className="bg-emerald-500"
                      style={{ flexGrow: b.outbound }}
                      title={`Ausgehend: ${b.outbound}`}
                    />
                  )}
                  {b.inbound > 0 && (
                    <div
                      className="bg-blue-500"
                      style={{ flexGrow: b.inbound }}
                      title={`Eingehend: ${b.inbound}`}
                    />
                  )}
                  {b.missed > 0 && (
                    <div
                      className="bg-red-400"
                      style={{ flexGrow: b.missed }}
                      title={`Verpasst: ${b.missed}`}
                    />
                  )}
                </div>
              </div>
              {/* Label nur bei ausreichend Platz zeigen — sonst wird es unleserlich. */}
              {bars.length <= 30 && (
                <p className="truncate text-[9px] text-gray-400">{b.label}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function isoWeek(date: Date): number {
  // Standard-ISO-8601-Wochen-Berechnung: Donnerstag der Woche gibt das Jahr vor.
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function daysBackLabel(isoDate: string, totalDays: number): string {
  const d = new Date(isoDate);
  if (totalDays <= 7) {
    return d.toLocaleDateString("de-DE", { weekday: "short" });
  }
  // 30-Tage: nur jeden 3. Tag beschriften, damit es nicht kollidiert.
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}
