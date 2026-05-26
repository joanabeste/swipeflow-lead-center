import type { DaySegment } from "@/lib/zeit/reports";
import { formatTimeDe, formatHours } from "@/lib/zeit/format";
import { addDaysToStartOfDayInAppTz, startOfDayInAppTz } from "@/lib/zeit/timezone";

interface Props {
  segments: DaySegment[];
}

export function DayTimeline({ segments }: Props) {
  if (segments.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400 dark:border-[#2c2c2e]/60">
        Heute noch keine Eintraege.
      </div>
    );
  }

  // Auf 24h-Schiene skalieren (Berliner Mitternacht bis Mitternacht — DST-sicher,
  // damit Server (UTC) und Client identisch rendern und die Eintraege auf den
  // richtigen Kalendertag fallen).
  const dayStart = startOfDayInAppTz(segments[0].startsAt);
  const dayEnd = addDaysToStartOfDayInAppTz(dayStart, 1);
  const totalMs = dayEnd.getTime() - dayStart.getTime();

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
      <div className="relative h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-[#1c1c1e]">
        {segments.map((s) => {
          const left = ((s.startsAt.getTime() - dayStart.getTime()) / totalMs) * 100;
          const width = (s.seconds * 1000 / totalMs) * 100;
          return (
            <div
              key={s.id}
              className="absolute top-0 h-full bg-primary"
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${formatTimeDe(s.startsAt)} – ${formatTimeDe(s.endsAt)}`}
            />
          );
        })}
      </div>
      <ul className="mt-4 space-y-1.5">
        {segments.map((s) => (
          <li key={s.id} className="flex items-center justify-between text-sm">
            <span className="font-mono tabular-nums text-gray-600 dark:text-gray-300">
              {formatTimeDe(s.startsAt)} – {formatTimeDe(s.endsAt)}
            </span>
            <span className="flex-1 px-3 truncate text-gray-500 dark:text-gray-400">{s.note ?? ""}</span>
            <span className="font-mono text-gray-700 dark:text-gray-200">{formatHours(s.seconds)} h</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
