"use client";

import { useMemo, useState } from "react";
import { PhoneCall } from "lucide-react";
import type { DashboardData } from "./data";

type Range = "7" | "30" | "90";

type Bar = {
  label: string;
  tooltipLabel: string;
  outbound: number;
  inbound: number;
  missed: number;
};

/**
 * Filterbare Anruf-Trends.
 * Nutzt die 90-Tage-Rohdaten aus DashboardData und filtert/bündelt clientseitig:
 *   - 7 Tage:  7 tägliche Balken
 *   - 30 Tage: 30 tägliche Balken (dünner)
 *   - 90 Tage: ~13 wöchentliche Balken (sonst zu dünn zum Hovern)
 */
export function CallTrendsWidget({ data }: { data: DashboardData }) {
  const [range, setRange] = useState<Range>("30");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

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
      const weekly: Bar[] = [];
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
        const firstDate = new Date(chunk[0].date);
        const lastDate = new Date(chunk[chunk.length - 1].date);
        weekly.push({
          label: `KW ${isoWeek(firstDate)}`,
          tooltipLabel: `KW ${isoWeek(firstDate)} (${formatShortDate(firstDate)} – ${formatShortDate(lastDate)})`,
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
      bars: slice.map<Bar>((d) => ({
        label: daysBackLabel(d.date, days),
        tooltipLabel: tooltipLabelForDay(d.date),
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
            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:bg-white/5 dark:text-gray-400">
              Team
            </span>
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
            <div
              key={i}
              className="relative flex flex-1 flex-col items-center gap-1"
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx((cur) => (cur === i ? null : cur))}
            >
              <div className="flex w-full flex-col justify-end" style={{ height: "7rem" }}>
                <div
                  className="flex w-full flex-col overflow-hidden rounded-t-md"
                  style={{ height: `${h}%` }}
                >
                  {b.outbound > 0 && <div className="bg-emerald-500" style={{ flexGrow: b.outbound }} />}
                  {b.inbound > 0 && <div className="bg-blue-500" style={{ flexGrow: b.inbound }} />}
                  {b.missed > 0 && <div className="bg-red-400" style={{ flexGrow: b.missed }} />}
                </div>
              </div>
              {/* Label nur bei ausreichend Platz zeigen — sonst wird es unleserlich. */}
              {bars.length <= 30 && (
                <p className="truncate text-[9px] text-gray-400">{b.label}</p>
              )}
              {hoverIdx === i && <BarTooltip bar={b} />}
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

function tooltipLabelForDay(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function BarTooltip({ bar }: { bar: Bar }) {
  const total = bar.outbound + bar.inbound + bar.missed;
  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-gray-200 bg-white p-2.5 text-xs shadow-lg dark:border-[#3a3a3c] dark:bg-[#2c2c2e]">
      <p className="mb-1.5 font-semibold text-gray-900 dark:text-gray-100">{bar.tooltipLabel}</p>
      <TooltipRow color="bg-emerald-500" label="Ausgehend" value={bar.outbound} />
      <TooltipRow color="bg-blue-500" label="Eingehend" value={bar.inbound} />
      <TooltipRow color="bg-red-400" label="Verpasst" value={bar.missed} />
      <div className="my-1.5 border-t border-gray-100 dark:border-[#3a3a3c]" />
      <div className="flex items-center justify-between gap-4 text-gray-700 dark:text-gray-200">
        <span className="font-medium">Gesamt</span>
        <span className="font-semibold tabular-nums">{total}</span>
      </div>
    </div>
  );
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5 text-gray-600 dark:text-gray-300">
      <span className="flex items-center gap-1.5">
        <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
        {label}
      </span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
