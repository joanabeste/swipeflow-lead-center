"use client";

import { useEffect, useMemo, useState, useTransition, type ComponentType } from "react";
import { PhoneCall, PhoneOutgoing, CalendarCheck, Handshake } from "lucide-react";
import type { DashboardData } from "./data";
import { loadCallTrendRange, type CallTrendRange } from "./call-trend-range";
import { formatAmount } from "@/lib/deals/types";
import { MEMBER_PALETTE, OTHERS_COLOR, OTHERS_KEY, MEMBER_TOP_N, type MemberColor } from "./member-colors";

type Range = "7" | "30" | "90" | "custom";
type ColorMode = "direction" | "member";

type DayRow = { date: string; outbound: number; inbound: number; missed: number; byUser: Record<string, number> };

type Bar = {
  label: string;
  tooltipLabel: string;
  outbound: number;
  inbound: number;
  missed: number;
  byUser: Record<string, number>;
};

type Member = {
  key: string; // userId oder OTHERS_KEY
  name: string;
  color: MemberColor;
  total: number;
};

/**
 * Filterbare Anruf-Trends.
 * Nutzt die 90-Tage-Rohdaten aus DashboardData und filtert/bündelt clientseitig:
 *   - 7 Tage:  7 tägliche Balken
 *   - 30 Tage: 30 tägliche Balken (dünner)
 *   - 90 Tage: ~13 wöchentliche Balken (sonst zu dünn zum Hovern)
 * Einfärbung wahlweise nach Richtung (ausgehend/eingehend/verpasst) oder nach
 * Mitarbeiter (Top-N + "Andere"), mit klickbarer Legende zum Filtern.
 */
export function CallTrendsWidget({ data }: { data: DashboardData }) {
  const [range, setRange] = useState<Range>("30");
  const [colorMode, setColorMode] = useState<ColorMode>("direction");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  // null = alle aktiv; sonst Set der aktiven Member-Keys.
  const [selected, setSelected] = useState<Set<string> | null>(null);
  // Frei gewählter Zeitraum: Von/Bis (YYYY-MM-DD) + serverseitig geladene Daten.
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rangeData, setRangeData] = useState<CallTrendRange | null>(null);
  const [isPending, startTransition] = useTransition();
  const isCustom = range === "custom";

  // Custom-Zeitraum serverseitig nachladen, sobald Von+Bis gesetzt sind.
  useEffect(() => {
    if (range !== "custom" || !customFrom || !customTo) return;
    startTransition(async () => {
      const res = await loadCallTrendRange(customFrom, customTo);
      setRangeData(res);
    });
  }, [range, customFrom, customTo]);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of data.teamCallStats) m.set(s.userId, s.name);
    return m;
  }, [data.teamCallStats]);

  const { bars, total, outbound, inbound, missed, kpis } = useMemo(() => {
    // Custom → serverseitig geladene Daten; Presets → Slice der 90-Tage-Reihen.
    if (isCustom) {
      const cd = rangeData?.callsByDay ?? [];
      const b = buildBars(cd, cd.length);
      return {
        ...b,
        total: b.outbound + b.inbound + b.missed,
        kpis: {
          anwahlen: rangeData?.totals.outbound ?? 0,
          termine: rangeData?.appointmentsBooked ?? 0,
          dealsCreated: rangeData?.dealsCreated ?? 0,
          dealsWon: rangeData?.dealsWon ?? 0,
          wonCents: rangeData?.wonCents ?? 0,
        },
      };
    }

    const days = parseInt(range, 10);
    const b = buildBars(data.callsByDay90.slice(-days), days);
    const apptSlice = data.appointmentsByDay90.slice(-days);
    const dealSlice = data.dealsByDay90.slice(-days);
    return {
      ...b,
      total: b.outbound + b.inbound + b.missed,
      kpis: {
        anwahlen: b.outbound,
        termine: apptSlice.reduce((s, d) => s + d.count, 0),
        dealsCreated: dealSlice.reduce((s, d) => s + d.created, 0),
        dealsWon: dealSlice.reduce((s, d) => s + d.won, 0),
        wonCents: dealSlice.reduce((s, d) => s + d.wonCents, 0),
      },
    };
  }, [data.callsByDay90, data.appointmentsByDay90, data.dealsByDay90, range, rangeData, isCustom]);

  // Mitarbeiter-Ranking über den gewählten Range: Top-N bekommen Farben,
  // Rest wird zu "Andere" gebündelt. Reihenfolge/Farbe pro Range fixiert,
  // damit das Ein-/Ausblenden in der Legende nicht umfärbt.
  const { members, coloredIds } = useMemo(() => {
    const totals = new Map<string, number>();
    for (const b of bars) {
      for (const [uid, n] of Object.entries(b.byUser)) {
        totals.set(uid, (totals.get(uid) ?? 0) + n);
      }
    }
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const top = ranked.slice(0, MEMBER_TOP_N);
    const rest = ranked.slice(MEMBER_TOP_N);

    const colored = new Set<string>(top.map(([uid]) => uid));
    const list: Member[] = top.map(([uid, count], i) => ({
      key: uid,
      name: nameById.get(uid) ?? "Unbekannt",
      color: MEMBER_PALETTE[i % MEMBER_PALETTE.length],
      total: count,
    }));
    const restTotal = rest.reduce((s, [, n]) => s + n, 0);
    if (restTotal > 0) {
      list.push({ key: OTHERS_KEY, name: "Andere", color: OTHERS_COLOR, total: restTotal });
    }
    return { members: list, coloredIds: colored };
  }, [bars, nameById]);

  const isActive = (key: string) => selected === null || selected.has(key);
  const toggleMember = (key: string) => {
    setSelected((cur) => {
      // Aus "alle" heraus: erster Klick wählt genau diesen Member.
      if (cur === null) return new Set([key]);
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      // Keiner mehr aktiv → zurück zu "alle".
      return next.size === 0 ? null : next;
    });
  };

  const memberCount = (b: Bar, m: Member): number => {
    if (m.key === OTHERS_KEY) {
      let s = 0;
      for (const [uid, n] of Object.entries(b.byUser)) if (!coloredIds.has(uid)) s += n;
      return s;
    }
    return b.byUser[m.key] ?? 0;
  };

  // maxBar je Modus. Im Mitarbeiter-Modus auf Basis ALLER zugeordneten Calls
  // (unabhängig von der Auswahl), damit gefilterte Anteile als Lücke sichtbar
  // bleiben und die Achse stabil ist.
  const maxBar = useMemo(() => {
    if (colorMode === "member") {
      return Math.max(
        1,
        ...bars.map((b) => Object.values(b.byUser).reduce((s, n) => s + n, 0)),
      );
    }
    return Math.max(1, ...bars.map((b) => b.outbound + b.inbound + b.missed));
  }, [bars, colorMode]);

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
        <div className="flex flex-wrap items-center justify-end gap-1.5">
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
            <button
              type="button"
              onClick={() => {
                // Beim Wechsel auf Custom sinnvolle Defaults setzen (letzte 30 Tage).
                if (!customFrom || !customTo) {
                  const today = new Date();
                  const past = new Date(Date.now() - 29 * 24 * 3600_000);
                  setCustomFrom(past.toISOString().slice(0, 10));
                  setCustomTo(today.toISOString().slice(0, 10));
                }
                setRange("custom");
              }}
              className={`rounded px-2 py-0.5 ${
                isCustom
                  ? "bg-gray-200 font-medium dark:bg-white/10"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              Zeitraum
            </button>
          </div>
          <div className="flex rounded-md border border-gray-200 p-0.5 text-xs dark:border-[#2c2c2e]">
            {([
              ["direction", "Art"],
              ["member", "Mitarbeiter"],
            ] as const).map(([mode, label]) => {
              const active = colorMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setColorMode(mode)}
                  className={`rounded px-2 py-0.5 ${
                    active
                      ? "bg-gray-200 font-medium dark:bg-white/10"
                      : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {isCustom && (
        <div className="mt-3 flex flex-wrap items-end gap-2 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-gray-500 dark:text-gray-400">Von</span>
            <input
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e] dark:text-gray-100"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-gray-500 dark:text-gray-400">Bis</span>
            <input
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e] dark:text-gray-100"
            />
          </label>
          {isPending && <span className="pb-1.5 text-gray-400">Lädt…</span>}
        </div>
      )}

      <div className="mt-5 flex h-32 items-end gap-1">
        {bars.map((b, i) => {
          const renderedSum =
            colorMode === "member"
              ? members.reduce((s, m) => s + (isActive(m.key) ? memberCount(b, m) : 0), 0)
              : b.outbound + b.inbound + b.missed;
          const h = (renderedSum / maxBar) * 100;
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
                  {colorMode === "direction" ? (
                    <>
                      {b.outbound > 0 && <div className="bg-emerald-500" style={{ flexGrow: b.outbound }} />}
                      {b.inbound > 0 && <div className="bg-blue-500" style={{ flexGrow: b.inbound }} />}
                      {b.missed > 0 && <div className="bg-red-400" style={{ flexGrow: b.missed }} />}
                    </>
                  ) : (
                    members.map((m) => {
                      if (!isActive(m.key)) return null;
                      const c = memberCount(b, m);
                      if (c === 0) return null;
                      return <div key={m.key} className={m.color.bar} style={{ flexGrow: c }} />;
                    })
                  )}
                </div>
              </div>
              {/* Label nur bei ausreichend Platz zeigen — sonst wird es unleserlich. */}
              {bars.length <= 30 && (
                <p className="truncate text-[9px] text-gray-400">{b.label}</p>
              )}
              {hoverIdx === i && (
                <BarTooltip
                  bar={b}
                  colorMode={colorMode}
                  members={members}
                  memberCount={memberCount}
                  isActive={isActive}
                />
              )}
            </div>
          );
        })}
      </div>

      {colorMode === "member" && (
        <MemberLegend
          members={members}
          selected={selected}
          isActive={isActive}
          onToggle={toggleMember}
          onReset={() => setSelected(null)}
        />
      )}

      {/* KPIs passend zum Zeitraum. Presets clientseitig aus den 90-Tage-Reihen,
          Custom aus der Server-Action. */}
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-gray-100 pt-4 dark:border-[#2c2c2e]/60 sm:grid-cols-3">
        <TrendStat
          icon={PhoneOutgoing}
          label="Getätigte Anwahlen"
          value={kpis.anwahlen}
          loading={isCustom && isPending}
        />
        <TrendStat
          icon={CalendarCheck}
          label="Gelegte Termine"
          value={kpis.termine}
          loading={isCustom && isPending}
        />
        <TrendStat
          icon={Handshake}
          label="Deals erstellt"
          value={kpis.dealsCreated}
          subtitle={`${kpis.dealsWon} gewonnen · ${formatAmount(kpis.wonCents)}`}
          loading={isCustom && isPending}
        />
      </div>
    </div>
  );
}

function TrendStat({
  icon: Icon,
  label,
  value,
  subtitle,
  loading,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
  subtitle?: string;
  loading?: boolean;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
        <Icon className="h-3.5 w-3.5 text-emerald-500" />
        {label}
      </p>
      {loading ? (
        <div className="mt-1 h-6 w-14 animate-pulse rounded bg-gray-100 dark:bg-white/5" />
      ) : (
        <p className="mt-0.5 text-lg font-bold tabular-nums">{value.toLocaleString("de-DE")}</p>
      )}
      {subtitle && !loading && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
      )}
    </div>
  );
}

function MemberLegend({
  members,
  selected,
  isActive,
  onToggle,
  onReset,
}: {
  members: Member[];
  selected: Set<string> | null;
  isActive: (key: string) => boolean;
  onToggle: (key: string) => void;
  onReset: () => void;
}) {
  if (members.length === 0) {
    return (
      <p className="mt-4 text-xs text-gray-400">Keine zugeordneten Anrufe im Zeitraum.</p>
    );
  }
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {members.map((m) => {
        const active = isActive(m.key);
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onToggle(m.key)}
            className={`flex items-center gap-1.5 text-xs transition-opacity ${
              active ? "opacity-100" : "opacity-35"
            }`}
          >
            <span className={`inline-block h-2 w-2 rounded-full ${m.color.dot}`} />
            <span className="text-gray-600 dark:text-gray-300">{m.name}</span>
            <span className="tabular-nums text-gray-400">{m.total}</span>
          </button>
        );
      })}
      {selected !== null && (
        <button
          type="button"
          onClick={onReset}
          className="text-xs text-gray-400 underline-offset-2 hover:text-gray-600 hover:underline dark:hover:text-gray-300"
        >
          Alle
        </button>
      )}
    </div>
  );
}

/**
 * Baut aus einer Tagesreihe die Chart-Balken. Bei mehr als ~35 Tagen wird
 * wöchentlich gebündelt (sonst zu dünn/viele Balken), sonst täglich — geteilt
 * von den 7/30/90-Presets und dem frei gewählten Zeitraum.
 */
function buildBars(
  callsByDay: DayRow[],
  days: number,
): { bars: Bar[]; outbound: number; inbound: number; missed: number } {
  let totalOut = 0, totalIn = 0, totalMiss = 0;
  for (const d of callsByDay) {
    totalOut += d.outbound;
    totalIn += d.inbound;
    totalMiss += d.missed;
  }

  if (days > 35) {
    // Wöchentlich bündeln. Ältester Balken = älteste Woche.
    const weekly: Bar[] = [];
    for (let i = 0; i < callsByDay.length; i += 7) {
      const chunk = callsByDay.slice(i, i + 7);
      if (chunk.length === 0) continue;
      const byUser: Record<string, number> = {};
      const sum = chunk.reduce(
        (acc, d) => {
          for (const [uid, n] of Object.entries(d.byUser)) byUser[uid] = (byUser[uid] ?? 0) + n;
          return {
            outbound: acc.outbound + d.outbound,
            inbound: acc.inbound + d.inbound,
            missed: acc.missed + d.missed,
          };
        },
        { outbound: 0, inbound: 0, missed: 0 },
      );
      const firstDate = new Date(chunk[0].date);
      const lastDate = new Date(chunk[chunk.length - 1].date);
      weekly.push({
        label: `KW ${isoWeek(firstDate)}`,
        tooltipLabel: `KW ${isoWeek(firstDate)} (${formatShortDate(firstDate)} – ${formatShortDate(lastDate)})`,
        byUser,
        ...sum,
      });
    }
    return { bars: weekly, outbound: totalOut, inbound: totalIn, missed: totalMiss };
  }

  // Täglich
  return {
    bars: callsByDay.map<Bar>((d) => ({
      label: daysBackLabel(d.date, days),
      tooltipLabel: tooltipLabelForDay(d.date),
      outbound: d.outbound,
      inbound: d.inbound,
      missed: d.missed,
      byUser: d.byUser,
    })),
    outbound: totalOut,
    inbound: totalIn,
    missed: totalMiss,
  };
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

function BarTooltip({
  bar,
  colorMode,
  members,
  memberCount,
  isActive,
}: {
  bar: Bar;
  colorMode: ColorMode;
  members: Member[];
  memberCount: (b: Bar, m: Member) => number;
  isActive: (key: string) => boolean;
}) {
  if (colorMode === "member") {
    const rows = members
      .filter((m) => isActive(m.key))
      .map((m) => ({ m, count: memberCount(bar, m) }))
      .filter((r) => r.count > 0);
    const total = rows.reduce((s, r) => s + r.count, 0);
    return (
      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-gray-200 bg-white p-2.5 text-xs shadow-lg dark:border-[#3a3a3c] dark:bg-[#2c2c2e]">
        <p className="mb-1.5 font-semibold text-gray-900 dark:text-gray-100">{bar.tooltipLabel}</p>
        {rows.length === 0 ? (
          <p className="text-gray-400">Keine Anrufe</p>
        ) : (
          rows.map((r) => (
            <TooltipRow key={r.m.key} color={r.m.color.dot} label={r.m.name} value={r.count} />
          ))
        )}
        <div className="my-1.5 border-t border-gray-100 dark:border-[#3a3a3c]" />
        <div className="flex items-center justify-between gap-4 text-gray-700 dark:text-gray-200">
          <span className="font-medium">Gesamt</span>
          <span className="font-semibold tabular-nums">{total}</span>
        </div>
      </div>
    );
  }

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
