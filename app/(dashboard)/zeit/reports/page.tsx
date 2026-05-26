import Link from "next/link";
import { Download } from "lucide-react";
import { requireZeitUser } from "@/lib/zeit/auth";
import { aggregateEntries, getRangeFor, isPeriodView, targetSecondsInRange } from "@/lib/zeit/reports";
import { scheduleFromProfile, breakModeFromProfile } from "@/lib/zeit/types";
import { formatHours, formatWeekdayDateDe } from "@/lib/zeit/format";
import { loadEntriesInRange, loadOwnAbsences } from "../_components/data-helpers";
import { PeriodTabs } from "../_components/period-tabs";
import { PeriodBars } from "../_components/period-bars";

export default async function ZeitReportsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireZeitUser();
  const view = isPeriodView(sp.view) ? sp.view : "month";
  const range = getRangeFor(view);
  const schedule = scheduleFromProfile(ctx.profile);
  const breakMode = breakModeFromProfile(ctx.profile);

  const [entries, absences] = await Promise.all([
    loadEntriesInRange(ctx.user.id, range.from, range.to),
    loadOwnAbsences(ctx.user.id),
  ]);
  const aggregate = aggregateEntries(entries, breakMode);
  const target = targetSecondsInRange(schedule, range.from, range.to, absences);
  const progress = target > 0 ? Math.round((aggregate.totalSeconds / target) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Reports</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Soll/Ist nach Zeitraum</p>
        </div>
        <Link
          href={`/zeit/reports/export.csv?view=${view}`}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-[#2c2c2e]/60 dark:bg-[#161618] dark:text-gray-200"
        >
          <Download className="h-4 w-4" /> CSV
        </Link>
      </div>

      <PeriodTabs basePath="/zeit/reports" current={view} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card label="Gearbeitet" value={`${formatHours(aggregate.totalSeconds)} h`} />
        <Card label="Soll" value={`${formatHours(target)} h`} />
        <Card label="Fortschritt" value={target > 0 ? `${progress}%` : "—"} />
      </div>

      <PeriodBars byDay={aggregate.byDay} />

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 dark:bg-[#1c1c1e]">
            <tr><th className="px-4 py-3 text-left">Datum</th><th className="px-4 py-3 text-left">Eintraege</th><th className="px-4 py-3 text-right">Dauer</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-[#2c2c2e]/40">
            {aggregate.byDay.map((d) => (
              <tr key={d.date}>
                <td className="px-4 py-2 text-gray-700 dark:text-gray-200">{formatWeekdayDateDe(d.date)}</td>
                <td className="px-4 py-2 text-gray-500">{d.entries}</td>
                <td className="px-4 py-2 text-right font-mono text-gray-900 dark:text-white">{formatHours(d.seconds)} h</td>
              </tr>
            ))}
            {aggregate.byDay.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-400">Keine Eintraege.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}
