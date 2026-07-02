"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3, CalendarCheck, CalendarClock, Coins, Euro, FileDown, Loader2,
  Percent, PhoneOutgoing, Sparkles, TrendingUp, Trophy, Wallet,
} from "lucide-react";
import { formatAmount } from "@/lib/deals/types";
import type { KpiTotals, SalesKpiReport } from "@/lib/deals/kpi-report";
import { Card } from "../../widgets/_widgets/shared";
import { MEMBER_PALETTE, OTHERS_COLOR, OTHERS_KEY, MEMBER_TOP_N } from "../../widgets/member-colors";
import { KpiCard } from "../_components/kpi-card";
import { closeMonthOptions } from "../_lib/close-month";
import { useToastContext } from "../../toast-provider";

const nf = new Intl.NumberFormat("de-DE");
const money = (c: number) => formatAmount(c);
const num = (n: number) => nf.format(n);

const REC = "#2f8f9d";
const WEB = "#7c5cff";
const GOLD = "#d2a966";

export function StatsDashboard({ report, month }: { report: SalesKpiReport; month: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [downloading, setDownloading] = useState(false);
  const { addToast } = useToastContext();
  const monthOptions = closeMonthOptions(month);
  const t = report.total;

  function changeMonth(m: string) {
    if (m === month) return;
    startTransition(() => router.push(`/deals/statistiken?month=${m}`));
  }

  async function downloadPdf() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/deals/kpi-pdf?month=${month}`, { cache: "no-store" });
      if (!res.ok) throw new Error((await res.text().catch(() => "")) || `Fehler ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sales-report-${month}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      addToast("Report wird heruntergeladen.", "success");
    } catch (e) {
      addToast(e instanceof Error ? e.message : "Report konnte nicht erstellt werden.", "error");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className={`space-y-6 ${pending ? "opacity-60 transition-opacity" : ""}`}>
      {/* Header */}
      <header className="flex flex-wrap items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <BarChart3 className="h-5 w-5" />
        </span>
        <div className="mr-auto">
          <h1 className="text-2xl font-bold tracking-tight">Statistiken</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Sales-Kennzahlen für {report.monthLabel} · {report.repCount} aktive Vertriebler
          </p>
        </div>
        <div className="relative">
          <select
            value={month}
            onChange={(e) => changeMonth(e.target.value)}
            disabled={pending}
            className="appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm font-medium capitalize focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-[#2c2c2e] dark:bg-[#232325]"
          >
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value} className="capitalize">{m.label}</option>
            ))}
          </select>
          {pending && <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-gray-400" />}
        </div>
        <button
          type="button"
          onClick={downloadPdf}
          disabled={downloading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-primary-dark disabled:opacity-60"
        >
          {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
          PDF herunterladen
        </button>
      </header>

      {/* 1. Monats-KPIs */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <HeroCard label="Anwahlen Gesamt" value={num(t.anwahlen)} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:col-span-2">
          <KpiCard icon={CalendarClock} label="Setting Termine" value={num(t.settingTermine)} subtitle="im Monat" tone="primary" />
          <KpiCard icon={CalendarCheck} label="Closing Termine" value={num(t.closingTermine)} subtitle="im Monat" tone="primary" />
          <KpiCard icon={Trophy} label="Closings" value={num(t.closings)} subtitle="gewonnene Deals" tone="success" />
          <KpiCard icon={Euro} label="Closing-Volumen" value={money(t.closingVolumeCents)} subtitle="Umsatz gewonnen" tone="success" />
          <KpiCard icon={CalendarCheck} label="Termine gesamt" value={num(t.settingTermine + t.closingTermine)} subtitle="Setting + Closing" tone="neutral" />
        </div>
      </div>

      {/* 2. Anwahlen pro Tag */}
      <DailyCallsChart data={report.callsPerDay} reps={report.reps} monthLabel={report.monthLabel} />

      {/* 3. Anwahlen pro Mitarbeiter */}
      <Card>
        <SectionTitle>Anwahlen pro Mitarbeiter</SectionTitle>
        <HBars
          rows={report.reps
            .filter((r) => r.anwahlen > 0)
            .map((r, i) => ({ label: r.name, value: r.anwahlen, display: num(r.anwahlen), colorClass: MEMBER_PALETTE[i % MEMBER_PALETTE.length].bar }))}
          empty="Keine Anwahlen in diesem Monat."
        />
      </Card>

      {/* 4. Termine & Closings nach Bereich */}
      <Card>
        <SectionTitle>Termine &amp; Closings nach Bereich</SectionTitle>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <VerticalCard title="Recruiting" color={REC} k={report.byVertical.recruiting} />
          <VerticalCard title="Webentwicklung" color={WEB} k={report.byVertical.webdesign} />
          <VerticalCard title="Gesamt" color={GOLD} k={report.total} highlight />
        </div>
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Closing-Volumen nach Bereich</p>
          <HBars
            rows={[
              { label: "Recruiting", value: report.byVertical.recruiting.closingVolumeCents, display: money(report.byVertical.recruiting.closingVolumeCents), colorHex: REC },
              { label: "Webentwicklung", value: report.byVertical.webdesign.closingVolumeCents, display: money(report.byVertical.webdesign.closingVolumeCents), colorHex: WEB },
              { label: "Gesamt", value: report.total.closingVolumeCents, display: money(report.total.closingVolumeCents), colorHex: GOLD },
            ]}
            empty="Kein Closing-Volumen in diesem Monat."
          />
        </div>
      </Card>

      {/* 5. Deals-Pipeline (Snapshot) + Deals im Monat */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card>
            <SectionTitle sub="Stand jetzt">Deals-Pipeline</SectionTitle>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <KpiCard icon={Wallet} label="Offenes Volumen" value={money(report.dealsSnapshot.openVolumeCents)} subtitle={`${num(report.dealsSnapshot.openCount)} offene Deals`} tone="primary" />
              <KpiCard icon={TrendingUp} label="Forecast" value={money(report.dealsSnapshot.weightedForecastCents)} subtitle="gewichtet" tone="neutral" />
              <KpiCard icon={Coins} label="Ø Deal-Größe" value={money(report.dealsSnapshot.avgDealSizeCents)} tone="neutral" />
              <KpiCard icon={Percent} label="Gewinn-Quote" value={`${num(report.dealsSnapshot.winRatePct)} %`} subtitle={`${num(report.dealsSnapshot.wonCountAll)} / ${num(report.dealsSnapshot.wonCountAll + report.dealsSnapshot.lostCountAll)}`} tone="success" />
              <KpiCard icon={Trophy} label="Gewonnen gesamt" value={num(report.dealsSnapshot.wonCountAll)} subtitle="alle Zeit" tone="success" />
              <KpiCard icon={BarChart3} label="Verloren gesamt" value={num(report.dealsSnapshot.lostCountAll)} subtitle="alle Zeit" tone="neutral" />
            </div>
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Volumen pro Stage</p>
              <HBars
                rows={report.dealsByStage
                  .filter((s) => s.count > 0)
                  .map((s) => ({ label: `${s.label} · ${num(s.count)}`, value: s.volumeCents, display: money(s.volumeCents), colorHex: s.color }))}
                empty="Keine Deals in der Pipeline."
              />
            </div>
          </Card>
        </div>
        <Card>
          <SectionTitle sub={report.monthLabel}>Deals im Monat</SectionTitle>
          <div className="space-y-2.5">
            <MonthDealRow label="Erstellt" count={report.dealsMonth.createdCount} cents={report.dealsMonth.createdVolumeCents} color={GOLD} />
            <MonthDealRow label="Gewonnen" count={report.dealsMonth.wonCount} cents={report.dealsMonth.wonVolumeCents} color="#2e9e6b" />
            <MonthDealRow label="Verloren" count={report.dealsMonth.lostCount} cents={report.dealsMonth.lostVolumeCents} color="#c2543f" />
          </div>
        </Card>
      </div>

      {/* 6. Leistung je Mitarbeiter */}
      <Card>
        <SectionTitle>Leistung je Mitarbeiter</SectionTitle>
        {report.reps.length === 0 ? (
          <Empty>Keine Vertriebler-Aktivität in diesem Monat.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-[#2c2c2e] dark:text-gray-400">
                  <Th>Mitarbeiter</Th><Th right>Anwahlen</Th><Th right>Setting-Termine</Th><Th right>Closings</Th><Th right>Volumen</Th>
                </tr>
              </thead>
              <tbody>
                {report.reps.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 dark:border-[#2c2c2e]/40 dark:hover:bg-white/5">
                    <Td><span className="font-medium">{r.name}</span></Td>
                    <Td right>{num(r.anwahlen)}</Td>
                    <Td right>{num(r.settingTermine)}</Td>
                    <Td right>{num(r.closings)}</Td>
                    <Td right>{money(r.closingVolumeCents)}</Td>
                  </tr>
                ))}
                <tr className="border-t-2 border-primary font-bold">
                  <Td>Gesamt</Td>
                  <Td right>{num(t.anwahlen)}</Td>
                  <Td right>{num(t.settingTermine)}</Td>
                  <Td right>{num(t.closings)}</Td>
                  <Td right>{money(t.closingVolumeCents)}</Td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 7. Deals im Detail + Setting-Termine */}
      <Card>
        <SectionTitle sub="offen + im Monat abgeschlossen">Deals im Detail</SectionTitle>
        {report.dealsList.length === 0 ? (
          <Empty>Keine offenen oder in diesem Monat abgeschlossenen Deals.</Empty>
        ) : (
          <div className="space-y-4">
            {report.dealsList.map((g) => (
              <div key={g.stageLabel} className="overflow-hidden rounded-xl border border-gray-200 dark:border-[#2c2c2e]/50">
                <div className="flex items-center justify-between bg-gray-50 px-3 py-2 text-sm font-semibold dark:bg-white/5">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: g.stageColor }} />
                    {g.stageLabel} <span className="text-gray-400">· {num(g.count)}</span>
                  </span>
                  <span>{money(g.volumeCents)}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wide text-gray-400 dark:border-[#2c2c2e]/40">
                        <Th>Titel</Th><Th>Firma</Th><Th>Bereich</Th><Th right>Betrag</Th><Th>{g.showSetter ? "Setter" : "Vertriebler"}</Th><Th right>Wahrsch.</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((d, i) => (
                        <tr
                          key={i}
                          onClick={() => router.push(`/deals/${d.id}`)}
                          className="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50 dark:border-[#2c2c2e]/30 dark:hover:bg-white/5"
                        >
                          <Td><div className="max-w-[180px] truncate font-medium text-primary" title={d.title}>{d.title}</div></Td>
                          <Td><div className="max-w-[200px] truncate" title={d.company}>{d.company}</div></Td>
                          <Td>{d.bereich}</Td>
                          <Td right>{money(d.amountCents)}</Td>
                          <Td><span className="whitespace-nowrap">{g.showSetter ? (d.setter ?? "—") : d.assignee}</span></Td>
                          <Td right>{d.probabilityPct == null ? "—" : `${num(d.probabilityPct)} %`}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle sub={report.monthLabel}>Setting-Termine im Detail</SectionTitle>
        {report.settingList.length === 0 ? (
          <Empty>Keine Setting-Termine in diesem Monat.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-[#2c2c2e] dark:text-gray-400">
                  <Th>Datum</Th><Th>Firma / Lead</Th><Th>Setter</Th>
                </tr>
              </thead>
              <tbody>
                {report.settingList.map((s, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 dark:border-[#2c2c2e]/40 dark:hover:bg-white/5">
                    <Td>{formatDay(s.date)}</Td>
                    <Td><span className="font-medium">{s.company}</span></Td>
                    <Td>{s.setter}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="pt-2 text-[11px] leading-relaxed text-gray-400">
        „Setting-Termine pro Mitarbeiter“ heuristisch (letzter Anrufer vor dem Termin). Bereichs-Aufteilung: Recruiting + Webentwicklung ergeben nicht zwingend die Gesamtzahl — nicht eindeutig zuordenbare Datensätze zählen nur in Gesamt. Alle Zahlen in Europe/Berlin; Termine nach Termin-Datum, Closings nach Abschlussdatum.
      </p>
    </div>
  );
}

// ---- Bausteine ----

function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-sm font-bold tracking-tight">{children}</h2>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  );
}

function HeroCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-6 dark:border-primary/20">
      <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-primary/10 blur-2xl" />
      <div className="relative">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
          <PhoneOutgoing className="h-3.5 w-3.5" />
          {label}
        </div>
        <p className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl tabular-nums">{value}</p>
        {hint && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 text-xs font-medium text-primary dark:bg-white/5">
            <Sparkles className="h-3 w-3" />
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

function VerticalCard({ title, color, k, highlight }: { title: string; color: string; k: KpiTotals; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? "border-primary/40 bg-primary/5" : "border-gray-200 dark:border-[#2c2c2e]/50"}`}>
      <div className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        {title}
      </div>
      <MetricRow k="Anwahlen" v={num(k.anwahlen)} />
      <MetricRow k="Setting Termine" v={num(k.settingTermine)} />
      <MetricRow k="Closing Termine" v={num(k.closingTermine)} />
      <MetricRow k="Closings" v={num(k.closings)} />
      <MetricRow k="Volumen" v={money(k.closingVolumeCents)} last />
    </div>
  );
}

function MetricRow({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 text-sm ${last ? "" : "border-b border-dashed border-gray-100 dark:border-[#2c2c2e]/40"}`}>
      <span className="text-gray-500 dark:text-gray-400">{k}</span>
      <span className="font-semibold tabular-nums">{v}</span>
    </div>
  );
}

function MonthDealRow({ label, count, cents, color }: { label: string; count: number; cents: number; color: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5 dark:border-[#2c2c2e]/50">
      <span className="inline-flex items-center gap-2 text-sm font-medium">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </span>
      <span className="text-right">
        <span className="text-sm font-bold tabular-nums">{num(count)}</span>
        <span className="ml-2 text-xs text-gray-400 tabular-nums">{money(cents)}</span>
      </span>
    </div>
  );
}

interface BarRow { label: string; value: number; display: string; colorClass?: string; colorHex?: string }

function HBars({ rows, empty }: { rows: BarRow[]; empty: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2">
      {rows.map((r, i) => {
        const pct = Math.max((r.value / max) * 100, r.value > 0 ? 2 : 0);
        return (
          <div
            key={i}
            className="grid grid-cols-[minmax(120px,180px)_1fr_auto] items-center gap-3"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover((c) => (c === i ? null : c))}
          >
            <span className="truncate text-xs font-medium" title={r.label}>{r.label}</span>
            <div className="h-3.5 overflow-hidden rounded-full bg-gray-100 dark:bg-[#232325]">
              <div
                className={`h-full rounded-full transition-all ${r.colorClass ?? ""} ${hover === i ? "opacity-100" : "opacity-90"}`}
                style={{ width: `${pct.toFixed(1)}%`, backgroundColor: r.colorHex }}
              />
            </div>
            <span className="w-24 text-right text-xs font-semibold tabular-nums">{r.display}</span>
          </div>
        );
      })}
    </div>
  );
}

type DayCalls = { date: string; count: number; byUser: Record<string, number> };
type Member = { key: string; name: string; color: { bar: string; dot: string }; total: number };

function DailyCallsChart({
  data,
  reps,
  monthLabel,
}: {
  data: DayCalls[];
  reps: SalesKpiReport["reps"];
  monthLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [mode, setMode] = useState<"total" | "member">("total");
  const [selected, setSelected] = useState<Set<string> | null>(null);

  const nameById = useMemo(() => new Map(reps.map((r) => [r.id, r.name])), [reps]);
  const total = data.reduce((s, d) => s + d.count, 0);

  // Mitarbeiter-Ranking über den Monat: Top-N bekommen Farben, Rest → „Andere".
  const { members, coloredIds } = useMemo(() => {
    const totals = new Map<string, number>();
    for (const d of data) for (const [uid, n] of Object.entries(d.byUser)) totals.set(uid, (totals.get(uid) ?? 0) + n);
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const colored = new Set(ranked.slice(0, MEMBER_TOP_N).map(([uid]) => uid));
    const list: Member[] = ranked.slice(0, MEMBER_TOP_N).map(([uid, count], i) => ({
      key: uid, name: nameById.get(uid) ?? "Unbekannt", color: MEMBER_PALETTE[i % MEMBER_PALETTE.length], total: count,
    }));
    const restTotal = ranked.slice(MEMBER_TOP_N).reduce((s, [, n]) => s + n, 0);
    if (restTotal > 0) list.push({ key: OTHERS_KEY, name: "Andere", color: OTHERS_COLOR, total: restTotal });
    return { members: list, coloredIds: colored };
  }, [data, nameById]);

  const isActive = (key: string) => selected === null || selected.has(key);
  const toggleMember = (key: string) =>
    setSelected((cur) => {
      if (cur === null) return new Set([key]);
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next.size === 0 ? null : next;
    });
  const memberCount = (d: DayCalls, m: Member): number => {
    if (m.key === OTHERS_KEY) {
      let s = 0;
      for (const [uid, n] of Object.entries(d.byUser)) if (!coloredIds.has(uid)) s += n;
      return s;
    }
    return d.byUser[m.key] ?? 0;
  };

  const max = useMemo(() => {
    if (mode === "member") return Math.max(1, ...data.map((d) => Object.values(d.byUser).reduce((s, n) => s + n, 0)));
    return Math.max(1, ...data.map((d) => d.count));
  }, [data, mode]);

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold tracking-tight">Anwahlen pro Tag</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{monthLabel} · {num(total)} gesamt · Spitze {num(max)}/Tag</span>
          <div className="flex rounded-md border border-gray-200 p-0.5 text-xs dark:border-[#2c2c2e]">
            {([["total", "Gesamt"], ["member", "Mitarbeiter"]] as const).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded px-2 py-0.5 ${mode === m ? "bg-gray-200 font-medium dark:bg-white/10" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {total === 0 ? (
        <Empty>Keine Anwahlen in diesem Monat.</Empty>
      ) : (
        <>
          <div className="flex h-40 items-end gap-1">
            {data.map((d, i) => {
              const rendered = mode === "member"
                ? members.reduce((s, m) => s + (isActive(m.key) ? memberCount(d, m) : 0), 0)
                : d.count;
              const h = (rendered / max) * 100;
              return (
                <div
                  key={d.date}
                  className="relative flex h-full flex-1 flex-col justify-end"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover((c) => (c === i ? null : c))}
                >
                  <div className="flex w-full flex-col overflow-hidden rounded-t" style={{ height: `${h.toFixed(1)}%`, minHeight: rendered > 0 ? 2 : 0 }}>
                    {mode === "member" ? (
                      members.map((m) => {
                        if (!isActive(m.key)) return null;
                        const c = memberCount(d, m);
                        return c > 0 ? <div key={m.key} className={m.color.bar} style={{ flexGrow: c }} /> : null;
                      })
                    ) : (
                      <div className={`h-full w-full ${hover === i ? "bg-primary-dark" : "bg-primary"}`} />
                    )}
                  </div>
                  {hover === i && (
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-gray-200 bg-white p-2.5 text-xs shadow-lg dark:border-[#3a3a3c] dark:bg-[#2c2c2e]">
                      <p className="mb-1 font-semibold">{formatDay(d.date)}</p>
                      {mode === "member" ? (
                        (() => {
                          const rows = members.filter((m) => isActive(m.key)).map((m) => ({ m, c: memberCount(d, m) })).filter((r) => r.c > 0);
                          if (rows.length === 0) return <p className="text-gray-400">Keine Anwahlen</p>;
                          return (
                            <>
                              {rows.map((r) => (
                                <div key={r.m.key} className="flex items-center justify-between gap-4 py-0.5">
                                  <span className="flex items-center gap-1.5"><span className={`inline-block h-2 w-2 rounded-full ${r.m.color.dot}`} />{r.m.name}</span>
                                  <span className="tabular-nums">{r.c}</span>
                                </div>
                              ))}
                              <div className="my-1 border-t border-gray-100 dark:border-[#3a3a3c]" />
                              <div className="flex items-center justify-between gap-4 font-semibold"><span>Gesamt</span><span className="tabular-nums">{rendered}</span></div>
                            </>
                          );
                        })()
                      ) : (
                        <span className="tabular-nums">{num(d.count)} Anwahlen</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {mode === "member" && (
            members.length === 0 ? (
              <p className="mt-4 text-xs text-gray-400">Keine zugeordneten Anrufe im Monat.</p>
            ) : (
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {members.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => toggleMember(m.key)}
                    className={`flex items-center gap-1.5 text-xs transition-opacity ${isActive(m.key) ? "opacity-100" : "opacity-35"}`}
                  >
                    <span className={`inline-block h-2 w-2 rounded-full ${m.color.dot}`} />
                    <span className="text-gray-600 dark:text-gray-300">{m.name}</span>
                    <span className="tabular-nums text-gray-400">{m.total}</span>
                  </button>
                ))}
                {selected !== null && (
                  <button type="button" onClick={() => setSelected(null)} className="text-xs text-gray-400 underline-offset-2 hover:text-gray-600 hover:underline dark:hover:text-gray-300">Alle</button>
                )}
              </div>
            )
          )}
        </>
      )}
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-gray-400">{children}</p>;
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <th className={`px-2 py-2 font-semibold ${right ? "text-right" : ""}`}>{children}</th>;
}
function Td({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <td className={`px-2 py-2 ${right ? "text-right tabular-nums" : ""}`}>{children}</td>;
}

/** "2026-06-15" → "15.06.2026". */
function formatDay(dateOnly: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : dateOnly;
}
