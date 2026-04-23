import Link from "next/link";
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, StickyNote, CheckSquare, Sun, Trophy } from "lucide-react";
import type { DashboardData } from "../data";
import { Card, LegendDot, weekdayShort } from "./shared";

// ─── Heutige Anrufe ────────────────────────────────────────────────

export function TodaysCallsWidget({ data }: { data: DashboardData }) {
  return (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 dark:border-[#2c2c2e]/50">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Phone className="h-3.5 w-3.5 text-emerald-500" />
          Heutige Anrufe
          <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            {data.todaysCalls.length}
          </span>
        </h2>
      </div>
      <div className="divide-y divide-gray-50 dark:divide-[#2c2c2e]/50">
        {data.todaysCalls.length === 0 && (
          <p className="px-5 py-6 text-center text-sm text-gray-400">Heute noch keine Anrufe.</p>
        )}
        {data.todaysCalls.map((c) => {
          const icon = c.status === "missed" ? <PhoneMissed className="h-3 w-3 text-red-500" />
            : c.direction === "inbound" ? <PhoneIncoming className="h-3 w-3 text-blue-500" />
              : <PhoneOutgoing className="h-3 w-3 text-emerald-500" />;
          return (
            <Link key={c.id} href={`/crm/${c.lead_id}`}
              className="flex items-center justify-between px-5 py-2.5 transition hover:bg-gray-50 dark:hover:bg-white/[0.02]">
              <div className="flex items-center gap-2 min-w-0">
                {icon}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.companyName}</p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {c.callerName ?? "—"} · {new Date(c.started_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
              <span className="text-xs text-gray-400 ml-2 shrink-0">{c.status}</span>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Mein Tag ────────────────────────────────────────────────

export function MyDayWidget({ data }: { data: DashboardData }) {
  const m = data.myDay;
  const greeting = greetingForHour(new Date().getHours());
  return (
    <Card>
      <div className="flex items-center gap-2">
        <Sun className="h-4 w-4 text-amber-500" />
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{greeting}</p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <MyDayMetric icon={Phone} label="Deine Anrufe heute" value={m.callsToday} accent="text-emerald-600 dark:text-emerald-400" />
        <MyDayMetric icon={StickyNote} label="Deine Notizen heute" value={m.notesToday} accent="text-blue-600 dark:text-blue-400" />
        <MyDayMetric icon={CheckSquare} label="Offene CRM-Todos" value={m.openTodos} accent="text-primary" link="/crm?crm_status=todo" />
      </div>
    </Card>
  );
}

function MyDayMetric({
  icon: Icon, label, value, accent, link,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: number; accent?: string; link?: string;
}) {
  const inner = (
    <>
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${accent ?? "text-gray-500"}`} />
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      </div>
      <p className={`mt-1 text-2xl font-bold ${accent ?? ""}`}>{value}</p>
    </>
  );
  if (link) {
    return (
      <Link href={link} className="rounded-xl border border-gray-100 p-3 transition hover:border-primary/40 hover:bg-gray-50 dark:border-[#2c2c2e] dark:hover:bg-white/[0.03]">
        {inner}
      </Link>
    );
  }
  return <div className="rounded-xl border border-gray-100 p-3 dark:border-[#2c2c2e]">{inner}</div>;
}

function greetingForHour(h: number): string {
  if (h < 5) return "Noch wach?";
  if (h < 11) return "Guten Morgen";
  if (h < 14) return "Mittag";
  if (h < 18) return "Nachmittag";
  return "Guten Abend";
}

// ─── Anrufe (7 Tage) ────────────────────────────────────────────────

export function CallStats7dWidget({ data }: { data: DashboardData }) {
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
        {data.callsByDay.map((d) => {
          const total = d.outbound + d.inbound + d.missed;
          const h = (total / maxDaily) * 100;
          return (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-col justify-end" style={{ height: "6rem" }}>
                <div className="flex w-full flex-col overflow-hidden rounded-t-md" style={{ height: `${h}%` }}>
                  {d.outbound > 0 && <div className="bg-emerald-500" style={{ flexGrow: d.outbound }} title={`Ausgehend: ${d.outbound}`} />}
                  {d.inbound > 0 && <div className="bg-blue-500" style={{ flexGrow: d.inbound }} title={`Eingehend: ${d.inbound}`} />}
                  {d.missed > 0 && <div className="bg-red-400" style={{ flexGrow: d.missed }} title={`Verpasst: ${d.missed}`} />}
                </div>
              </div>
              <p className="text-[10px] text-gray-400">{weekdayShort(d.date)}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Team-Leaderboard heute ──────────────────────────────────────

export function TeamLeaderboardWidget({ data }: { data: DashboardData }) {
  const rows = data.teamLeaderboard;
  const maxTotal = Math.max(1, ...rows.map((r) => r.total));
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Trophy className="h-3.5 w-3.5 text-amber-500" />
          Team — Anrufe heute
        </h2>
        <p className="text-xs text-gray-400">{rows.reduce((s, r) => s + r.total, 0)} gesamt</p>
      </div>
      <div className="mt-4 space-y-2.5">
        {rows.length === 0 && (
          <p className="py-4 text-center text-sm text-gray-400">Heute noch keine Anrufe protokolliert.</p>
        )}
        {rows.map((r, i) => {
          const pct = (r.total / maxTotal) * 100;
          const rate = r.total > 0 ? Math.round((r.answered / r.total) * 100) : 0;
          const medals = ["🥇", "🥈", "🥉"];
          const medal = i < 3 ? medals[i] : null;
          return (
            <div key={r.userId} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-1.5">
                  {medal ? (
                    <span className="text-sm leading-none">{medal}</span>
                  ) : (
                    <span className="w-4 text-right text-gray-400">{i + 1}.</span>
                  )}
                  <span className="truncate font-medium">{r.name}</span>
                </span>
                <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{r.total}</span>
                  <span className="ml-2 text-gray-400">{rate}% angenommen</span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-[#2c2c2e]">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
