import Link from "next/link";
import { Download } from "lucide-react";
import { aggregateEntries, getRangeFor, isPeriodView, targetSecondsInRange } from "@/lib/zeit/reports";
import { scheduleFromProfile, breakModeFromProfile, type Absence } from "@/lib/zeit/types";
import { formatHours } from "@/lib/zeit/format";
import { createServiceClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { loadAllAbsences, loadAllEntriesInRange } from "../../_components/data-helpers";
import { PeriodTabs } from "../../_components/period-tabs";

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams;
  const view = isPeriodView(sp.view) ? sp.view : "month";
  const range = getRangeFor(view);

  const db = createServiceClient();
  const { data: profilesData } = await db
    .from("profiles")
    .select("id, name, email, role, hours_mon, hours_tue, hours_wed, hours_thu, hours_fri, hours_sat, hours_sun, vacation_days_per_year, break_mode")
    .order("name", { ascending: true });
  const profiles = (profilesData ?? []) as Profile[];

  const [entries, absences] = await Promise.all([
    loadAllEntriesInRange(range.from, range.to),
    loadAllAbsences(),
  ]);
  const absencesByUser = new Map<string, Absence[]>();
  for (const a of absences) {
    const list = absencesByUser.get(a.user_id) ?? [];
    list.push(a);
    absencesByUser.set(a.user_id, list);
  }
  const entriesByUser = new Map<string, typeof entries>();
  for (const e of entries) {
    const list = entriesByUser.get(e.user_id) ?? [];
    list.push(e);
    entriesByUser.set(e.user_id, list);
  }

  const rows = profiles.map((p) => {
    const userEntries = entriesByUser.get(p.id) ?? [];
    const userAbs = absencesByUser.get(p.id) ?? [];
    const breakMode = breakModeFromProfile(p);
    const aggregate = aggregateEntries(userEntries, breakMode);
    const target = targetSecondsInRange(scheduleFromProfile(p), range.from, range.to, userAbs);
    const progress = target > 0 ? Math.round((aggregate.totalSeconds / target) * 100) : 0;
    return { p, worked: aggregate.totalSeconds, target, progress };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Gesamt-Reports</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Soll/Ist je Mitarbeiter</p>
        </div>
        <Link href={`/zeit/admin/reports/export.csv?view=${view}`} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-[#2c2c2e]/60 dark:bg-[#161618] dark:text-gray-200">
          <Download className="h-4 w-4" /> CSV (alle)
        </Link>
      </div>

      <PeriodTabs basePath="/zeit/admin/reports" current={view} />

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 dark:bg-[#1c1c1e]">
            <tr>
              <th className="px-4 py-3 text-left">Mitarbeiter</th>
              <th className="px-4 py-3 text-right">Gearbeitet</th>
              <th className="px-4 py-3 text-right">Soll</th>
              <th className="px-4 py-3 text-left">Fortschritt</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-[#2c2c2e]/40">
            {rows.map(({ p, worked, target, progress }) => (
              <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900 dark:text-white">{p.name}</p>
                  <p className="text-[11px] text-gray-400">{p.email}</p>
                </td>
                <td className="px-4 py-3 text-right font-mono text-gray-900 dark:text-white">{formatHours(worked)} h</td>
                <td className="px-4 py-3 text-right font-mono text-gray-500">{formatHours(target)} h</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-[#1c1c1e]">
                      <div className="h-full bg-primary" style={{ width: `${Math.min(100, progress)}%` }} />
                    </div>
                    <span className="w-12 text-right text-xs text-gray-500">{progress}%</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/zeit/admin/mitarbeiter/${p.id}`} className="text-xs font-medium text-primary hover:underline">Details</Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-sm text-gray-400">Keine Profile gefunden.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
