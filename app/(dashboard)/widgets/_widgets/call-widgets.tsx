"use client";

import { useState } from "react";
import Link from "next/link";
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, StickyNote, CheckSquare, Sun, Trophy } from "lucide-react";
import type { DashboardData } from "../data";
import type { TodayCallListItem } from "@/lib/calls/today";
import { callStatusDisplay } from "@/lib/calls/status-display";
import { Card } from "./shared";

export { CallStats7dWidget } from "./call-stats-7d";

// ─── Heutige Anrufe ────────────────────────────────────────────────

type CallsTab = "verlauf" | "person" | "status";

export function TodaysCallsWidget({ data }: { data: DashboardData }) {
  const [tab, setTab] = useState<CallsTab>("verlauf");
  const s = data.todaysCallSummary;

  return (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 dark:border-[#2c2c2e]/50">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Phone className="h-3.5 w-3.5 text-emerald-500" />
          Heutige Anrufe
          <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            {s.total}
          </span>
        </h2>
      </div>

      {/* KPI-Kopf */}
      <div className="grid grid-cols-4 divide-x divide-gray-100 border-b border-gray-100 dark:divide-[#2c2c2e]/50 dark:border-[#2c2c2e]/50">
        <Kpi label="Gesamt" value={s.total} />
        <Kpi label="Angenommen" value={s.answered} accent="text-emerald-600 dark:text-emerald-400" />
        <Kpi label="Verpasst" value={s.missed} accent="text-amber-600 dark:text-amber-400" />
        <Kpi label="Erreichsquote" value={`${s.reachRate}%`} accent="text-primary" />
      </div>

      {/* Ansichts-Umschalter */}
      <div className="flex items-center gap-1 px-3 pt-3">
        <TabButton active={tab === "verlauf"} onClick={() => setTab("verlauf")}>Verlauf</TabButton>
        <TabButton active={tab === "person"} onClick={() => setTab("person")}>Nach Person</TabButton>
        <TabButton active={tab === "status"} onClick={() => setTab("status")}>Nach Status</TabButton>
      </div>

      {s.total === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-gray-400">Heute noch keine Anrufe.</p>
      ) : tab === "verlauf" ? (
        <CallsHistoryView data={data} />
      ) : tab === "person" ? (
        <CallsByPersonView rows={s.byPerson} />
      ) : (
        <CallsByStatusView rows={s.byStatus} total={s.total} />
      )}
    </Card>
  );
}

function Kpi({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="px-3 py-2.5 text-center">
      <p className="text-[11px] text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${accent ?? ""}`}>{value}</p>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
        active
          ? "bg-primary text-gray-900"
          : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
      }`}
    >
      {children}
    </button>
  );
}

// = TODAY_CALLS_PAGE_SIZE (lib/calls/today.ts); dort liegt die Wahrheit, hier
// gespiegelt, weil das Modul "server-only" ist und nicht in den Client darf.
const CALLS_PAGE_SIZE = 20;

function CallsHistoryView({ data }: { data: DashboardData }) {
  const total = data.todaysCallsTotal;
  const totalPages = Math.max(1, Math.ceil(total / CALLS_PAGE_SIZE));
  const [page, setPage] = useState(1);
  const [fetched, setFetched] = useState<TodayCallListItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seite 1 ist server-vorgerendert (data.todaysCalls); weitere Seiten on-demand.
  const items: TodayCallListItem[] = page === 1 ? data.todaysCalls : fetched ?? [];

  async function goToPage(p: number) {
    if (p < 1 || p > totalPages || p === page || loading) return;
    if (p === 1) {
      setPage(1);
      setFetched(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/calls/today?offset=${(p - 1) * CALLS_PAGE_SIZE}&limit=${CALLS_PAGE_SIZE}`);
      if (!r.ok) throw new Error(`Status ${r.status}`);
      const j = (await r.json()) as { calls: TodayCallListItem[] };
      setFetched(j.calls);
      setPage(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className={`mt-2 divide-y divide-gray-50 dark:divide-[#2c2c2e]/50 ${loading ? "opacity-50" : ""}`}>
        {items.map((c) => <CallRow key={c.id} c={c} />)}
      </div>
      {error && <p className="px-5 py-2 text-center text-xs text-red-500">{error}</p>}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-2.5 text-xs dark:border-[#2c2c2e]/50">
          <button
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1 || loading}
            className="rounded-lg px-2.5 py-1 font-medium text-gray-600 transition hover:bg-gray-100 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-white/5"
          >
            Zurück
          </button>
          <span className="tabular-nums text-gray-500 dark:text-gray-400">
            Seite {page}/{totalPages} · {total} gesamt
          </span>
          <button
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages || loading}
            className="rounded-lg px-2.5 py-1 font-medium text-gray-600 transition hover:bg-gray-100 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-white/5"
          >
            Weiter
          </button>
        </div>
      )}
    </div>
  );
}

function CallRow({ c }: { c: TodayCallListItem }) {
  const icon = c.status === "missed" ? <PhoneMissed className="h-3 w-3 text-red-500" />
    : c.direction === "inbound" ? <PhoneIncoming className="h-3 w-3 text-blue-500" />
      : <PhoneOutgoing className="h-3 w-3 text-emerald-500" />;
  const sd = callStatusDisplay(c.status);
  return (
    <Link href={`/crm/${c.lead_id}`}
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
      <span className={`ml-2 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${sd.cls}`}>{sd.label}</span>
    </Link>
  );
}

function CallsByPersonView({ rows }: { rows: DashboardData["todaysCallSummary"]["byPerson"] }) {
  const maxTotal = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div className="space-y-2.5 px-5 py-4">
      {rows.map((r) => {
        const pct = (r.total / maxTotal) * 100;
        return (
          <div key={r.userId} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-medium">{r.name}</span>
              <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
                <span className="font-semibold text-gray-900 dark:text-gray-100">{r.total}</span>
                <span className="ml-2 text-gray-400">{r.rate}% angenommen</span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-[#2c2c2e]">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CallsByStatusView({ rows, total }: { rows: DashboardData["todaysCallSummary"]["byStatus"]; total: number }) {
  const maxCount = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="space-y-2.5 px-5 py-4">
      {rows.map((r) => {
        const sd = callStatusDisplay(r.status);
        const pct = (r.count / maxCount) * 100;
        const share = total > 0 ? Math.round((r.count / total) * 100) : 0;
        return (
          <div key={r.status} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className={`inline-block h-2 w-2 rounded-full ${sd.dot}`} />
                <span className="truncate font-medium">{sd.label}</span>
              </span>
              <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
                <span className="font-semibold text-gray-900 dark:text-gray-100">{r.count}</span>
                <span className="ml-2 text-gray-400">{share}%</span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-[#2c2c2e]">
              <div className={`h-full ${sd.dot} transition-all`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
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
