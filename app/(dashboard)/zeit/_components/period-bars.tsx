import type { DailyTotal } from "@/lib/zeit/reports";
import { formatHours } from "@/lib/zeit/format";

interface Props {
  byDay: DailyTotal[];
  targetSecondsPerDay?: Map<string, number>;
}

export function PeriodBars({ byDay, targetSecondsPerDay }: Props) {
  if (byDay.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400 dark:border-[#2c2c2e]/60">
        Keine Eintraege im gewaehlten Zeitraum.
      </div>
    );
  }
  const max = Math.max(...byDay.map((d) => d.seconds), ...(targetSecondsPerDay ? [...targetSecondsPerDay.values()] : [0]));

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
      <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-14">
        {byDay.map((d) => {
          const target = targetSecondsPerDay?.get(d.date) ?? 0;
          const fillPct = max > 0 ? (d.seconds / max) * 100 : 0;
          const targetPct = max > 0 ? (target / max) * 100 : 0;
          return (
            <div key={d.date} className="flex flex-col items-center">
              <div className="relative flex h-32 w-full items-end justify-center">
                <div
                  className="w-full rounded-t bg-primary/80"
                  style={{ height: `${fillPct}%` }}
                  title={`${d.date}: ${formatHours(d.seconds)} h`}
                />
                {target > 0 && (
                  <div
                    className="absolute left-0 right-0 border-t border-dashed border-gray-400/70"
                    style={{ bottom: `${targetPct}%` }}
                  />
                )}
              </div>
              <span className="mt-1 text-[10px] text-gray-400">
                {new Date(d.date + "T00:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
