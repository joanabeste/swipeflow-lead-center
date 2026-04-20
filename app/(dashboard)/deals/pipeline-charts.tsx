"use client";

import type { DealStage, DealWithRelations } from "@/lib/deals/types";
import { formatAmount } from "@/lib/deals/types";

/**
 * Zwei schlanke Charts ohne externe Dependency:
 * 1) Horizontale Bar-Chart: Volumen pro Stage.
 * 2) Monatliches Gewonnen/Verloren der letzten 6 Monate (gestapelt).
 */
export function PipelineCharts({
  deals,
  stages,
}: {
  deals: DealWithRelations[];
  stages: DealStage[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <StageVolumeChart deals={deals} stages={stages} />
      <MonthlyTrendChart deals={deals} stages={stages} />
    </div>
  );
}

function StageVolumeChart({
  deals,
  stages,
}: {
  deals: DealWithRelations[];
  stages: DealStage[];
}) {
  const rows = stages
    .filter((s) => s.isActive)
    .map((s) => {
      const stageDeals = deals.filter((d) => d.stageId === s.id);
      const volume = stageDeals.reduce((sum, d) => sum + d.amountCents, 0);
      return { stage: s, count: stageDeals.length, volume };
    });
  const maxVolume = rows.reduce((m, r) => Math.max(m, r.volume), 0) || 1;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Volumen pro Stage
      </p>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">Keine Stages aktiv.</p>
      ) : (
        <div className="mt-4 space-y-2.5">
          {rows.map((r) => (
            <div key={r.stage.id}>
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.stage.color }} />
                  <span className="font-medium">{r.stage.label}</span>
                  <span className="text-gray-400">· {r.count}</span>
                </span>
                <span className="font-medium">{formatAmount(r.volume)}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-[#232325]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(r.volume / maxVolume) * 100}%`,
                    backgroundColor: r.stage.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MonthlyTrendChart({
  deals,
  stages,
}: {
  deals: DealWithRelations[];
  stages: DealStage[];
}) {
  const stageKindById = new Map(stages.map((s) => [s.id, s.kind]));

  // Letzte 6 Monate (aktueller zuerst umgekehrt)
  const now = new Date();
  const months: { key: string; label: string; won: number; lost: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({
      key,
      label: d.toLocaleDateString("de-DE", { month: "short" }),
      won: 0,
      lost: 0,
    });
  }
  const monthsByKey = new Map(months.map((m) => [m.key, m]));

  for (const d of deals) {
    const kind = stageKindById.get(d.stageId);
    if (kind !== "won" && kind !== "lost") continue;
    const closedAt = d.actualCloseDate ? new Date(d.actualCloseDate) : new Date(d.updatedAt);
    const key = `${closedAt.getFullYear()}-${String(closedAt.getMonth() + 1).padStart(2, "0")}`;
    const bucket = monthsByKey.get(key);
    if (!bucket) continue;
    if (kind === "won") bucket.won += d.amountCents;
    else bucket.lost += d.amountCents;
  }

  const maxValue = months.reduce((m, b) => Math.max(m, b.won + b.lost), 0) || 1;
  const totalWon = months.reduce((s, m) => s + m.won, 0);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Abschluss-Trend (6 Monate)
        </p>
        <p className="text-xs font-medium">
          <span className="text-emerald-600 dark:text-emerald-400">Gewonnen: {formatAmount(totalWon)}</span>
        </p>
      </div>
      <div className="mt-5 flex items-end gap-3" style={{ height: 120 }}>
        {months.map((m) => {
          const wonH = (m.won / maxValue) * 100;
          const lostH = (m.lost / maxValue) * 100;
          return (
            <div key={m.key} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-full w-full flex-col justify-end gap-px">
                {m.lost > 0 && (
                  <div
                    className="w-full rounded-sm bg-red-400"
                    style={{ height: `${lostH}%` }}
                    title={`Verloren: ${formatAmount(m.lost)}`}
                  />
                )}
                {m.won > 0 && (
                  <div
                    className="w-full rounded-sm bg-emerald-500"
                    style={{ height: `${wonH}%` }}
                    title={`Gewonnen: ${formatAmount(m.won)}`}
                  />
                )}
              </div>
              <span className="text-[10px] text-gray-500 dark:text-gray-400">{m.label}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-3 text-[10px] text-gray-500 dark:text-gray-400">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Gewonnen
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-red-400" /> Verloren
        </span>
      </div>
    </div>
  );
}
