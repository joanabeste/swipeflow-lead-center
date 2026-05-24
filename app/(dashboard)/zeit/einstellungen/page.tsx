import { requireZeitUser } from "@/lib/zeit/auth";
import { breakModeFromProfile, scheduleFromProfile, vacationDaysFromProfile, weeklyHoursFromSchedule } from "@/lib/zeit/types";
import { BreakModeForm } from "./_components/break-mode-form";

const DAY_LABELS: Array<{ key: keyof ReturnType<typeof scheduleFromProfile>; label: string }> = [
  { key: "mon", label: "Mo" }, { key: "tue", label: "Di" }, { key: "wed", label: "Mi" },
  { key: "thu", label: "Do" }, { key: "fri", label: "Fr" }, { key: "sat", label: "Sa" }, { key: "sun", label: "So" },
];

export default async function ZeitEinstellungenPage() {
  const ctx = await requireZeitUser();
  const schedule = scheduleFromProfile(ctx.profile);
  const weekly = weeklyHoursFromSchedule(schedule);
  const breakMode = breakModeFromProfile(ctx.profile);
  const vacation = vacationDaysFromProfile(ctx.profile);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Einstellungen</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Vertragsdaten siehst du hier zur Information — Aenderungen macht der Admin.</p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Vertrag</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Info label="Wochenstunden" value={`${weekly.toFixed(2).replace(/\.00$/, "")} h`} />
          <Info label="Urlaubsanspruch / Jahr" value={`${vacation} Tage`} />
          <Info label="Rolle" value={ctx.profile.role} />
        </div>
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">Tageszeitplan</p>
          <div className="grid grid-cols-7 gap-2">
            {DAY_LABELS.map((d) => (
              <div key={d.key} className="rounded-xl border border-gray-200 px-2 py-2 text-center text-xs dark:border-[#2c2c2e]/60">
                <p className="font-semibold text-gray-700 dark:text-gray-200">{d.label}</p>
                <p className="mt-1 font-mono text-gray-900 dark:text-white">{schedule[d.key].toString().replace(/\.0+$/, "")} h</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <BreakModeForm initial={breakMode} />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-1 text-base font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}
