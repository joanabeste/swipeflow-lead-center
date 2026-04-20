import Link from "next/link";
import { FileSpreadsheet, Upload, PhoneCall, Sparkles, Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, StickyNote, CheckSquare, Sun, Clock, Trophy, Briefcase, Mail } from "lucide-react";
import type { DashboardData } from "./data";

const statusLabels: Record<string, { label: string; color: string }> = {
  imported: { label: "Importiert", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  enriched: { label: "Angereichert", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  qualified: { label: "Qualifiziert", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  exported: { label: "Exportiert", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  cancelled: { label: "Ausgeschlossen", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  filtered: { label: "Gefiltert", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  enrichment_pending: { label: "Anreicherung", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
};

const actionLabels: Record<string, string> = {
  "lead.enriched": "Lead angereichert",
  "lead.enriched_and_cancelled": "Angereichert & ausgeschlossen",
  "lead.updated": "Lead aktualisiert",
  "lead.bulk_status_update": "Status geändert",
  "lead.crm_status_changed": "CRM-Status geändert",
  "lead.note_added": "Notiz hinzugefügt",
  "lead.call_logged": "Anruf protokolliert",
  "lead.deleted": "Lead gelöscht",
  "lead.created_manual": "Lead manuell angelegt",
  "import.completed": "Import abgeschlossen",
  "import.url": "URL-Import",
  "import.directory": "Verzeichnis-Import",
};

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e] ${className}`}>
      {children}
    </div>
  );
}

// ─── Pipeline ────────────────────────────────────────────────

export function PipelineWidget({ data }: { data: DashboardData }) {
  const c = data.counts;
  const excluded = c.cancelled + c.filtered;
  const pipeline = [
    { label: "Importiert", value: c.imported, color: "bg-gray-400" },
    { label: "Anreicherung", value: c.enrichmentPending, color: "bg-yellow-500" },
    { label: "Angereichert", value: c.enriched, color: "bg-blue-500" },
    { label: "Qualifiziert", value: c.qualified, color: "bg-green-500" },
    { label: "Exportiert", value: c.exported, color: "bg-purple-500" },
    { label: "Ausgeschlossen", value: excluded, color: "bg-orange-500" },
  ];
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Pipeline</p>
        <p className="text-sm font-bold">{c.total} Leads</p>
      </div>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        {pipeline.map((s) => (
          s.value > 0 && (
            <div key={s.label} className={`${s.color} transition-all`}
              style={{ width: `${(s.value / (c.total || 1)) * 100}%` }} title={`${s.label}: ${s.value}`} />
          )
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
        {pipeline.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-xs">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${s.color}`} />
            <span className="text-gray-500 dark:text-gray-400">{s.label}</span>
            <span className="font-medium">{s.value}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Stats ────────────────────────────────────────────────

export function StatsWidget({ data }: { data: DashboardData }) {
  const c = data.counts;
  const excluded = c.cancelled + c.filtered;
  const enrichTotal = c.enrichmentCompleted + c.enrichmentFailed;
  const enrichRate = enrichTotal > 0 ? Math.round((c.enrichmentCompleted / enrichTotal) * 100) : 0;
  const qualifyRate = c.total > 0 ? Math.round(((c.qualified + c.exported) / c.total) * 100) : 0;
  const exportRate = c.qualified + c.exported > 0
    ? Math.round((c.exported / (c.qualified + c.exported)) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {data.serviceMode === "webdev" ? (
        <>
          <StatCard label="Kein SSL" value={c.noSslCount} sub="Ohne Zertifikat" accent="text-red-600 dark:text-red-400" />
          <StatCard label="Nicht mobil" value={c.notMobileCount} sub="Nicht mobilfreundlich" accent="text-orange-600 dark:text-orange-400" />
          <StatCard label="Veraltetes Design" value={c.outdatedDesignCount} sub="Redesign-Potenzial" accent="text-yellow-600 dark:text-yellow-400" />
          <StatCard label="Qualifiziert" value={`${qualifyRate}%`} sub={`${c.qualified + c.exported} von ${c.total}`} />
        </>
      ) : (
        <>
          <StatCard label="Enrichment-Erfolg" value={`${enrichRate}%`} sub={`${c.enrichmentCompleted} / ${enrichTotal} Versuche`} />
          <StatCard label="Qualifiziert" value={`${qualifyRate}%`} sub={`${c.qualified + c.exported} von ${c.total}`} />
          <StatCard label="Export-Rate" value={`${exportRate}%`} sub={`${c.exported} exportiert`} />
          <StatCard label="Ausgeschlossen" value={excluded} sub={`${Math.round((excluded / (c.total || 1)) * 100)}% aller Leads`} />
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, accent = "" }: { label: string; value: string | number; sub: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent}`}>{value}</p>
      <p className="text-xs text-gray-400">{sub}</p>
    </div>
  );
}

// ─── Quick Actions ────────────────────────────────────────────────

export function QuickActionsWidget({ data }: { data: DashboardData }) {
  const c = data.counts;
  const actions = [
    { href: "/leads", icon: FileSpreadsheet, label: "Leads", sub: `${c.total} gesamt`, accent: "text-primary" },
    { href: "/import", icon: Upload, label: "Import", sub: "CSV, URL, Verzeichnis", accent: "text-primary" },
    { href: "/leads?status=imported", icon: Sparkles, label: "Anreichern", sub: `${c.imported} wartend`, accent: "text-primary" },
    { href: "/crm", icon: PhoneCall, label: "CRM", sub: `${c.qualified} in Pipeline`, accent: "text-green-500" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {actions.map((a) => (
        <Link key={a.href} href={a.href}
          className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-primary/40 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e] dark:hover:border-primary/40"
        >
          <a.icon className={`h-5 w-5 ${a.accent}`} />
          <div>
            <p className="text-sm font-medium">{a.label}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{a.sub}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ─── Recent Leads ────────────────────────────────────────────────

export function RecentLeadsWidget({ data }: { data: DashboardData }) {
  return (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 dark:border-[#2c2c2e]/50">
        <h2 className="text-sm font-medium">Zuletzt bearbeitet</h2>
        <Link href="/leads" className="text-xs text-primary hover:underline">Alle anzeigen</Link>
      </div>
      <div className="divide-y divide-gray-50 dark:divide-[#2c2c2e]/50">
        {data.recentLeads.length === 0 && (
          <p className="px-5 py-6 text-center text-sm text-gray-400">Noch keine Leads.</p>
        )}
        {data.recentLeads.map((lead) => {
          const s = statusLabels[lead.status] ?? { label: lead.status, color: "bg-gray-100 text-gray-700" };
          return (
            <Link key={lead.id} href={`/leads/${lead.id}`}
              className="flex items-center justify-between px-5 py-3 transition hover:bg-gray-50 dark:hover:bg-white/[0.02]">
              <span className="text-sm font-medium">{lead.company_name}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.color}`}>{s.label}</span>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Recent Activity ────────────────────────────────────────────────

export function RecentActivityWidget({ data }: { data: DashboardData }) {
  return (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 dark:border-[#2c2c2e]/50">
        <h2 className="text-sm font-medium">Letzte Aktivitäten</h2>
        <Link href="/aktivitaet" className="text-xs text-primary hover:underline">Alle anzeigen</Link>
      </div>
      <div className="divide-y divide-gray-50 dark:divide-[#2c2c2e]/50">
        {data.recentLogs.length === 0 && (
          <p className="px-5 py-6 text-center text-sm text-gray-400">Noch keine Aktivitäten.</p>
        )}
        {data.recentLogs.map((log) => {
          const prof = Array.isArray(log.profiles) ? log.profiles[0] : log.profiles;
          return (
            <div key={log.id} className="px-5 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{actionLabels[log.action] ?? log.action}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {new Date(log.created_at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{prof?.name ?? "System"}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── CRM-Queue ────────────────────────────────────────────────

export function CrmQueueWidget({ data }: { data: DashboardData }) {
  return (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 dark:border-[#2c2c2e]/50">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <PhoneCall className="h-3.5 w-3.5 text-blue-500" />
          CRM — Heute zu kontaktieren
          <span className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
            {data.crmQueue.length}
          </span>
        </h2>
        <Link href="/crm?crm_status=todo" className="text-xs text-primary hover:underline">Alle</Link>
      </div>
      <div className="divide-y divide-gray-50 dark:divide-[#2c2c2e]/50">
        {data.crmQueue.length === 0 && (
          <p className="px-5 py-6 text-center text-sm text-gray-400">Nichts zu tun — alle Todos erledigt.</p>
        )}
        {data.crmQueue.map((lead) => (
          <Link key={lead.id} href={`/crm/${lead.id}`}
            className="flex items-center justify-between px-5 py-3 transition hover:bg-gray-50 dark:hover:bg-white/[0.02]">
            <div>
              <p className="text-sm font-medium">{lead.company_name}</p>
              {lead.city && <p className="text-xs text-gray-500 dark:text-gray-400">{lead.city}</p>}
            </div>
            {lead.phone && (
              <span className="text-xs text-gray-500 dark:text-gray-400">{lead.phone}</span>
            )}
          </Link>
        ))}
      </div>
    </Card>
  );
}

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
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Anrufe (7 Tage)</p>
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

// ─── Enrichments (7 Tage) ───────────────────────────────────────

export function EnrichmentTrend7dWidget({ data }: { data: DashboardData }) {
  const maxDaily = Math.max(1, ...data.enrichmentsByDay.map((d) => d.completed + d.failed));
  const totalOk = data.enrichmentsByDay.reduce((s, d) => s + d.completed, 0);
  const totalFail = data.enrichmentsByDay.reduce((s, d) => s + d.failed, 0);
  const rate = totalOk + totalFail > 0 ? Math.round((totalOk / (totalOk + totalFail)) * 100) : 0;
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Anreicherungen (7 Tage)</p>
          <p className="mt-0.5 text-lg font-bold">{rate}% Erfolgsquote</p>
        </div>
        <div className="flex gap-3 text-xs">
          <LegendDot color="bg-emerald-500" label={`Erfolg ${totalOk}`} />
          <LegendDot color="bg-red-400" label={`Fehler ${totalFail}`} />
        </div>
      </div>
      <div className="mt-5 flex h-28 items-end gap-1.5">
        {data.enrichmentsByDay.map((d) => {
          const total = d.completed + d.failed;
          const h = (total / maxDaily) * 100;
          return (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-col justify-end" style={{ height: "6rem" }}>
                <div className="flex w-full flex-col overflow-hidden rounded-t-md" style={{ height: `${h}%` }}>
                  {d.completed > 0 && <div className="bg-emerald-500" style={{ flexGrow: d.completed }} title={`Erfolg: ${d.completed}`} />}
                  {d.failed > 0 && <div className="bg-red-400" style={{ flexGrow: d.failed }} title={`Fehler: ${d.failed}`} />}
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

// ─── CRM-Status-Verteilung ──────────────────────────────────────

export function CrmStatusDistributionWidget({ data }: { data: DashboardData }) {
  const total = data.crmStatusDistribution.reduce((s, d) => s + d.count, 0);
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">CRM-Status-Verteilung</p>
        <p className="text-sm font-bold">{total} Leads</p>
      </div>
      {data.crmStatusDistribution.length === 0 ? (
        <p className="mt-4 text-center text-sm text-gray-400">Noch keine CRM-Status konfiguriert.</p>
      ) : (
        <div className="mt-4 space-y-2.5">
          {data.crmStatusDistribution.map((s) => {
            const pct = total > 0 ? (s.count / total) * 100 : 0;
            return (
              <Link
                key={s.id}
                href={`/crm?crm_status=${s.id}`}
                className="block rounded-lg p-1.5 transition hover:bg-gray-50 dark:hover:bg-white/[0.02]"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="font-medium">{s.label}</span>
                  </div>
                  <span className="text-gray-500 dark:text-gray-400">
                    {s.count} {total > 0 && <span className="ml-1 text-gray-400">· {pct.toFixed(0)}%</span>}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ─── Follow-Up-Reminder ──────────────────────────────────────────

export function FollowUpReminderWidget({ data }: { data: DashboardData }) {
  const items = data.followUpReminders;
  return (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 dark:border-[#2c2c2e]/50">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Clock className="h-3.5 w-3.5 text-amber-500" />
          Überfällige Follow-Ups
          <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            {items.length}
          </span>
        </h2>
        <Link href="/crm?crm_status=todo" className="text-xs text-primary hover:underline">Alle</Link>
      </div>
      <div className="divide-y divide-gray-50 dark:divide-[#2c2c2e]/50">
        {items.length === 0 && (
          <p className="px-5 py-6 text-center text-sm text-gray-400">Keine Follow-Ups fällig — alles aktuell.</p>
        )}
        {items.map((lead) => (
          <Link
            key={lead.id}
            href={`/crm/${lead.id}`}
            className="flex items-center justify-between px-5 py-3 transition hover:bg-gray-50 dark:hover:bg-white/[0.02]"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{lead.company_name}</p>
              <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                {lead.city ?? "—"}
                {lead.phone && <span className="ml-2 text-gray-400">· {lead.phone}</span>}
              </p>
            </div>
            <span className="ml-2 shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              {lead.daysSince != null ? `${lead.daysSince} Tage` : "nie"}
            </span>
          </Link>
        ))}
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

// ─── Deal-Summary ────────────────────────────────────────────────

function formatEur(cents: number): string {
  const eur = cents / 100;
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(eur);
}

export function DealSummaryWidget({ data }: { data: DashboardData }) {
  const rows = data.dealSummary;
  const totalAmount = data.dealTotals.amountCents;
  const totalCount = data.dealTotals.count;
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Briefcase className="h-3.5 w-3.5 text-indigo-500" />
          Offene Deals
        </h2>
        <Link href="/deals" className="text-xs text-primary hover:underline">Öffnen</Link>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <p className="text-2xl font-bold tabular-nums">{formatEur(totalAmount)}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {totalCount} {totalCount === 1 ? "Deal" : "Deals"}
        </p>
      </div>
      <div className="mt-4 space-y-1.5">
        {rows.length === 0 && (
          <p className="py-2 text-center text-sm text-gray-400">Noch keine offenen Deals.</p>
        )}
        {rows.map((s) => {
          const pct = totalCount > 0 ? (s.count / totalCount) * 100 : 0;
          return (
            <div key={s.id} className="flex items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate">{s.label}</span>
                  <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{s.count}</span>
                    <span className="ml-2 text-gray-400">{formatEur(s.amountCents)}</span>
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-gray-100 dark:bg-[#2c2c2e]">
                  <div
                    className="h-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: s.color }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── E-Mail-Performance (7 Tage) ─────────────────────────────────

export function EmailStats7dWidget({ data }: { data: DashboardData }) {
  const maxDaily = Math.max(1, ...data.emailsByDay.map((d) => d.sent + d.failed));
  const total = data.emailsSent7d + data.emailsFailed7d;
  const rate = total > 0 ? Math.round((data.emailsSent7d / total) * 100) : 0;
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400">
            <Mail className="h-3.5 w-3.5 text-blue-500" />
            E-Mails (7 Tage)
          </p>
          <p className="mt-0.5 text-lg font-bold">
            {total} gesamt
            {total > 0 && <span className="ml-2 text-sm font-normal text-gray-500">· {rate}% erfolgreich</span>}
          </p>
        </div>
        <div className="flex gap-3 text-xs">
          <LegendDot color="bg-blue-500" label={`Gesendet ${data.emailsSent7d}`} />
          <LegendDot color="bg-red-400" label={`Fehler ${data.emailsFailed7d}`} />
        </div>
      </div>
      <div className="mt-5 flex h-24 items-end gap-1.5">
        {data.emailsByDay.map((d) => {
          const dayTotal = d.sent + d.failed;
          const h = (dayTotal / maxDaily) * 100;
          return (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-col justify-end" style={{ height: "5rem" }}>
                <div className="flex w-full flex-col overflow-hidden rounded-t-md" style={{ height: `${h}%` }}>
                  {d.sent > 0 && <div className="bg-blue-500" style={{ flexGrow: d.sent }} title={`Gesendet: ${d.sent}`} />}
                  {d.failed > 0 && <div className="bg-red-400" style={{ flexGrow: d.failed }} title={`Fehler: ${d.failed}`} />}
                </div>
              </div>
              <p className="text-[10px] text-gray-400">{weekdayShort(d.date)}</p>
            </div>
          );
        })}
      </div>
      {total === 0 && (
        <p className="mt-4 text-center text-xs text-gray-400">
          Noch keine E-Mails versendet — SMTP unter <Link href="/einstellungen/email" className="text-primary hover:underline">Einstellungen → E-Mail</Link> einrichten.
        </p>
      )}
    </Card>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function weekdayShort(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString("de-DE", { weekday: "short" });
}
