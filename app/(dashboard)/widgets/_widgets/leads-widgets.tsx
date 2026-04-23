import Link from "next/link";
import { FileSpreadsheet, Upload, PhoneCall, Sparkles, Clock } from "lucide-react";
import type { DashboardData } from "../data";
import { Card } from "./shared";

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
