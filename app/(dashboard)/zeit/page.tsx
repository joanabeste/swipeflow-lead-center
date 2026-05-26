import { requireZeitUser } from "@/lib/zeit/auth";
import { aggregateEntries, entriesAsSegments, getDayRange, getRangeFor, getYearRange, isPeriodView, targetSecondsInRange } from "@/lib/zeit/reports";
import { scheduleFromProfile, breakModeFromProfile, vacationDaysFromProfile } from "@/lib/zeit/types";
import { formatHours } from "@/lib/zeit/format";
import { loadEntriesInRange, loadOwnAbsences, loadRunningEntry } from "./_components/data-helpers";
import { TimerWidget } from "./_components/timer-widget";
import { DayTimeline } from "./_components/day-timeline";
import { PeriodTabs } from "./_components/period-tabs";
import { PeriodBars } from "./_components/period-bars";
import { countWorkdaysInAbsences } from "@/lib/zeit/reports";

export default async function ZeitDashboardPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireZeitUser();
  const view = isPeriodView(sp.view) ? sp.view : "week";
  const range = getRangeFor(view);
  const today = getDayRange();
  const schedule = scheduleFromProfile(ctx.profile);
  const breakMode = breakModeFromProfile(ctx.profile);

  const [running, todayEntries, periodEntries, absences] = await Promise.all([
    loadRunningEntry(ctx.user.id),
    loadEntriesInRange(ctx.user.id, today.from, today.to),
    loadEntriesInRange(ctx.user.id, range.from, range.to),
    loadOwnAbsences(ctx.user.id),
  ]);

  const segments = entriesAsSegments(todayEntries);
  const aggregate = aggregateEntries(periodEntries, breakMode);
  const target = targetSecondsInRange(schedule, range.from, range.to, absences);
  const yearRange = getYearRange();
  const vacationUsed = countWorkdaysInAbsences(absences, yearRange.from, yearRange.to);
  const vacationTotal = vacationDaysFromProfile(ctx.profile);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Zeiterfassung</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Hallo {ctx.profile.name} — Pausen-Modus: {breakMode === "manual" ? "manuell" : "automatischer Abzug"}
        </p>
      </div>

      <TimerWidget running={running ? { id: running.id, started_at: running.started_at, note: running.note } : null} />

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">Heute</h2>
        <DayTimeline segments={segments} />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">Zeitraum</h2>
          <PeriodTabs basePath="/zeit" current={view} />
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <SummaryCard label="Gearbeitet" value={`${formatHours(aggregate.totalSeconds)} h`} />
          <SummaryCard label="Soll" value={`${formatHours(target)} h`} />
          <SummaryCard
            label="Fortschritt"
            value={target > 0 ? `${Math.round((aggregate.totalSeconds / target) * 100)}%` : "—"}
          />
          <SummaryCard label="Urlaub (Jahr)" value={`${vacationUsed} / ${vacationTotal} Tage`} />
        </div>

        <div className="mt-4">
          <PeriodBars byDay={aggregate.byDay} />
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}
