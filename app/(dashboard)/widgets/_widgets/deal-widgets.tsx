import Link from "next/link";
import { Trophy, Briefcase } from "lucide-react";
import type { DashboardData } from "../data";
import { Card, LegendDot, formatEur } from "./shared";

// ─── Deal-Trends (12 Monate) ─────────────────────────────────────

export function DealTrendsWidget({ data }: { data: DashboardData }) {
  const months = data.dealsByMonth12;
  const wonTotal = months.reduce((s, m) => s + m.won, 0);
  const lostTotal = months.reduce((s, m) => s + m.lost, 0);
  const wonAmount = months.reduce((s, m) => s + m.wonAmountCents, 0);
  const closed = wonTotal + lostTotal;
  const winRate = closed > 0 ? Math.round((wonTotal / closed) * 100) : 0;
  const maxMonth = Math.max(1, ...months.map((m) => m.won + m.lost));

  const monthShort = (yyyyMM: string): string => {
    const [y, m] = yyyyMM.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString("de-DE", { month: "short" });
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400">
            <Trophy className="h-3.5 w-3.5 text-amber-500" />
            Deal-Abschlüsse (12 Monate)
          </p>
          <p className="mt-0.5 text-lg font-bold">
            {formatEur(wonAmount)}
            <span className="ml-2 text-sm font-normal text-gray-500">
              {wonTotal} gewonnen · {winRate}% Win-Rate
            </span>
          </p>
        </div>
        <div className="flex gap-3 text-xs">
          <LegendDot color="bg-emerald-500" label={`Won ${wonTotal}`} />
          <LegendDot color="bg-red-400" label={`Lost ${lostTotal}`} />
        </div>
      </div>
      {closed === 0 ? (
        <p className="mt-6 text-center text-sm text-gray-400">
          Noch keine Abschlüsse im letzten Jahr — der erste Deal kommt.
        </p>
      ) : (
        <div className="mt-5 flex h-32 items-end gap-1.5">
          {months.map((m) => {
            const sum = m.won + m.lost;
            const h = (sum / maxMonth) * 100;
            return (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-col justify-end" style={{ height: "7rem" }}>
                  <div className="flex w-full flex-col overflow-hidden rounded-t-md" style={{ height: `${h}%` }}>
                    {m.won > 0 && (
                      <div
                        className="bg-emerald-500"
                        style={{ flexGrow: m.won }}
                        title={`${monthShort(m.month)}: ${m.won} gewonnen · ${formatEur(m.wonAmountCents)}`}
                      />
                    )}
                    {m.lost > 0 && (
                      <div
                        className="bg-red-400"
                        style={{ flexGrow: m.lost }}
                        title={`${monthShort(m.month)}: ${m.lost} verloren`}
                      />
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-gray-400">{monthShort(m.month)}</p>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ─── Deal-Summary ────────────────────────────────────────────────

export function DealSummaryWidget({ data }: { data: DashboardData }) {
  const rows = data.dealSummary;
  const totalAmount = data.dealTotals.amountCents;
  const totalCount = data.dealTotals.count;
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Briefcase className="h-3.5 w-3.5 text-indigo-500" />
          Offene Deals
        </h2>
        <Link href="/deals" className="text-xs text-primary hover:underline">Öffnen</Link>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <p className="text-2xl font-bold tabular-nums">{formatEur(totalAmount)}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {totalCount} {totalCount === 1 ? "Deal" : "Deals"}
        </p>
      </div>
      <div className="mt-4 space-y-1.5">
        {rows.length === 0 && (
          <p className="py-2 text-center text-sm text-gray-400">Noch keine offenen Deals.</p>
        )}
        {rows.map((s) => {
          const pct = totalCount > 0 ? (s.count / totalCount) * 100 : 0;
          return (
            <div key={s.id} className="flex items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate">{s.label}</span>
                  <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{s.count}</span>
                    <span className="ml-2 text-gray-400">{formatEur(s.amountCents)}</span>
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-gray-100 dark:bg-[#2c2c2e]">
                  <div
                    className="h-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: s.color }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
