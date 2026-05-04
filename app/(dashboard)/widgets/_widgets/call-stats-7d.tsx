"use client";

import { useState } from "react";
import type { DashboardData } from "../data";
import { Card, LegendDot } from "./shared";

export function CallStats7dWidget({ data }: { data: DashboardData }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const maxDaily = Math.max(1, ...data.callsByDay.map((d) => d.outbound + d.inbound + d.missed));
  const totalInbound = data.callsByDay.reduce((s, d) => s + d.inbound, 0);
  const totalOutbound = data.callsByDay.reduce((s, d) => s + d.outbound, 0);
  const totalMissed = data.callsByDay.reduce((s, d) => s + d.missed, 0);
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400">
            Anrufe (7 Tage)
            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:bg-white/5 dark:text-gray-400">
              Team
            </span>
          </p>
          <p className="mt-0.5 text-lg font-bold">{data.callsTotal7d} gesamt</p>
        </div>
        <div className="flex gap-3 text-xs">
          <LegendDot color="bg-emerald-500" label={`Ausgehend ${totalOutbound}`} />
          <LegendDot color="bg-blue-500" label={`Eingehend ${totalInbound}`} />
          <LegendDot color="bg-red-400" label={`Verpasst ${totalMissed}`} />
        </div>
      </div>
      <div className="mt-5 flex h-28 items-end gap-1.5">
        {data.callsByDay.map((d, i) => {
          const total = d.outbound + d.inbound + d.missed;
          const h = (total / maxDaily) * 100;
          return (
            <div
              key={d.date}
              className="relative flex flex-1 flex-col items-center gap-1"
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx((cur) => (cur === i ? null : cur))}
            >
              <div className="flex w-full flex-col justify-end" style={{ height: "6rem" }}>
                <div className="flex w-full flex-col overflow-hidden rounded-t-md" style={{ height: `${h}%` }}>
                  {d.outbound > 0 && <div className="bg-emerald-500" style={{ flexGrow: d.outbound }} />}
                  {d.inbound > 0 && <div className="bg-blue-500" style={{ flexGrow: d.inbound }} />}
                  {d.missed > 0 && <div className="bg-red-400" style={{ flexGrow: d.missed }} />}
                </div>
              </div>
              <p className="text-[10px] text-gray-400">{weekdayShortLocal(d.date)}</p>
              {hoverIdx === i && (
                <BarTooltip
                  label={fullDateLabel(d.date)}
                  outbound={d.outbound}
                  inbound={d.inbound}
                  missed={d.missed}
                />
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function weekdayShortLocal(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString("de-DE", { weekday: "short" });
}

function fullDateLabel(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function BarTooltip({
  label,
  outbound,
  inbound,
  missed,
}: {
  label: string;
  outbound: number;
  inbound: number;
  missed: number;
}) {
  const total = outbound + inbound + missed;
  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-gray-200 bg-white p-2.5 text-xs shadow-lg dark:border-[#3a3a3c] dark:bg-[#2c2c2e]">
      <p className="mb-1.5 font-semibold text-gray-900 dark:text-gray-100">{label}</p>
      <TooltipRow color="bg-emerald-500" label="Ausgehend" value={outbound} />
      <TooltipRow color="bg-blue-500" label="Eingehend" value={inbound} />
      <TooltipRow color="bg-red-400" label="Verpasst" value={missed} />
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
