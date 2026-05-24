import Link from "next/link";
import { Users, UserCog, Sliders, Activity, Download, Archive, Coins, Briefcase, Clock } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import { aggregateEntries, getMonthRange } from "@/lib/zeit/reports";
import { formatHours } from "@/lib/zeit/format";

const TILES = [
  { href: "/admin/team", label: "Team-Uebersicht", desc: "Alle Mitarbeiter mit Stunden, Provisionen, Auszahlung", icon: Users },
  { href: "/einstellungen/team", label: "Nutzer & Rollen", desc: "User anlegen, Rollen + Sektion-Berechtigungen", icon: UserCog },
  { href: "/einstellungen/provisionen", label: "Provisionen & Loehne", desc: "Provisions-Regeln und Stundenloehne pflegen", icon: Coins },
  { href: "/admin/einstellungen", label: "Globale Einstellungen", desc: "App-weite Konfiguration", icon: Sliders },
  { href: "/aktivitaet", label: "Aktivitaet", desc: "Audit-Log aller wichtigen Aktionen", icon: Activity },
  { href: "/export", label: "Export", desc: "Daten-Export (CSV)", icon: Download },
  { href: "/einstellungen/aussortierte-leads", label: "Aussortierte Leads", desc: "Archivierte Leads ansehen / wiederherstellen", icon: Archive },
];

function fmtMoney(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

async function loadKpis() {
  const db = createServiceClient();
  const range = getMonthRange();

  // Profile (Anzahl + Status-Split)
  const profilesP = db.from("profiles").select("id, status, role");
  // Leads (Lifecycle-Split) — defensive falls Migration 071 fehlt
  const leadsP = db.from("leads").select("id, lifecycle_stage");
  // Zeit-Eintraege Monat
  const entriesP = db
    .from("time_entries")
    .select("user_id, started_at, ended_at")
    .gte("started_at", range.from.toISOString())
    .lt("started_at", range.to.toISOString());
  // Provisionen Monat
  const commP = db
    .from("commission_events")
    .select("amount_cents")
    .gte("earned_at", range.from.toISOString())
    .lt("earned_at", range.to.toISOString());
  // Offene Abwesenheits-Antraege
  const absP = db.from("absences").select("id", { count: "exact", head: true }).eq("status", "pending");

  const [profilesRes, leadsRes, entriesRes, commRes, absRes] = await Promise.all([profilesP, leadsP, entriesP, commP, absP]);

  const profiles = (profilesRes.data ?? []) as Array<{ id: string; status: string; role: string }>;
  const leads = (leadsRes.data ?? []) as Array<{ id: string; lifecycle_stage?: string | null }>;
  const entries = (entriesRes.data ?? []) as Array<{ started_at: string; ended_at: string | null }>;
  const comm = (commRes.data ?? []) as Array<{ amount_cents: number }>;

  const workedSeconds = aggregateEntries(entries.map((e, i) => ({
    id: String(i),
    user_id: "",
    started_at: e.started_at,
    ended_at: e.ended_at,
    note: null,
    lead_id: null,
    created_at: e.started_at,
    updated_at: e.started_at,
  }))).totalSeconds;

  return {
    users: {
      total: profiles.length,
      active: profiles.filter((p) => p.status === "active").length,
      admins: profiles.filter((p) => p.role === "admin").length,
    },
    leads: {
      total: leads.length,
      lead: leads.filter((l) => !l.lifecycle_stage || l.lifecycle_stage === "lead").length,
      deal: leads.filter((l) => l.lifecycle_stage === "deal").length,
      customer: leads.filter((l) => l.lifecycle_stage === "customer").length,
      archived: leads.filter((l) => l.lifecycle_stage === "archived").length,
    },
    workedSeconds,
    entriesCount: entries.length,
    commissionCents: comm.reduce((acc, e) => acc + e.amount_cents, 0),
    pendingAbsences: absRes.count ?? 0,
  };
}

async function loadRecentActivity() {
  const db = createServiceClient();
  const { data, error } = await db
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, details, created_at, user_id, profiles:user_id(name, email)")
    .order("created_at", { ascending: false })
    .limit(15);
  if (error) return [];
  return (data ?? []) as unknown as Array<{
    id: string;
    action: string;
    entity_type: string | null;
    entity_id: string | null;
    created_at: string;
    user_id: string | null;
    profiles: { name: string | null; email: string | null } | null;
  }>;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `vor ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `vor ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `vor ${d}d`;
  return new Date(iso).toLocaleDateString("de-DE");
}

export default async function AdminUebersichtPage() {
  const [kpis, activity] = await Promise.all([loadKpis(), loadRecentActivity()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Admin</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Verwaltung, Berechtigungen und globale Einstellungen</p>
      </div>

      {/* KPI-Karten */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Users} label="Nutzer" value={`${kpis.users.active}`} sub={`${kpis.users.total} gesamt · ${kpis.users.admins} Admin${kpis.users.admins === 1 ? "" : "s"}`} />
        <Kpi icon={Briefcase} label="Kunden" value={`${kpis.leads.customer}`} sub={`${kpis.leads.lead} Leads · ${kpis.leads.deal} Deals · ${kpis.leads.archived} archiviert`} />
        <Kpi icon={Clock} label="Stunden Monat" value={`${formatHours(kpis.workedSeconds)} h`} sub={`${kpis.entriesCount} Eintraege`} />
        <Kpi icon={Coins} label="Provisionen Monat" value={fmtMoney(kpis.commissionCents)} sub={kpis.pendingAbsences > 0 ? `⚠ ${kpis.pendingAbsences} offene Antraege` : "Alle Antraege bearbeitet"} highlight={kpis.pendingAbsences > 0} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Schnellzugriff */}
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">Schnellzugriff</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {TILES.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="group rounded-2xl border border-gray-200 bg-white p-5 transition hover:border-primary/40 hover:shadow-sm dark:border-[#2c2c2e]/50 dark:bg-[#161618] dark:hover:border-primary/40"
              >
                <t.icon className="h-6 w-6 text-primary" />
                <h3 className="mt-3 text-base font-semibold text-gray-900 dark:text-white">{t.label}</h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t.desc}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">Aktivitaet</h2>
          <div className="rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
            {activity.length === 0 ? (
              <p className="p-6 text-center text-xs text-gray-400">Noch keine Aktivitaet.</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-[#2c2c2e]/40">
                {activity.slice(0, 12).map((a) => (
                  <li key={a.id} className="px-4 py-2.5 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-gray-700 dark:text-gray-200">{a.action}</p>
                        <p className="text-[11px] text-gray-400">{a.profiles?.name || a.profiles?.email || "—"}</p>
                      </div>
                      <span className="shrink-0 text-[11px] text-gray-400">{relativeTime(a.created_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/aktivitaet" className="block border-t border-gray-100 px-4 py-2 text-center text-xs font-medium text-primary hover:bg-gray-50 dark:border-[#2c2c2e]/40 dark:hover:bg-white/5">
              Komplettes Audit-Log →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${highlight ? "border-amber-200 bg-amber-50/50 dark:border-amber-800/40 dark:bg-amber-900/10" : "border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#161618]"}`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${highlight ? "text-amber-600" : "text-gray-400"}`} />
        <p className={`text-xs font-medium uppercase tracking-wider ${highlight ? "text-amber-700 dark:text-amber-400" : "text-gray-400"}`}>{label}</p>
      </div>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${highlight ? "text-amber-700 dark:text-amber-300" : "text-gray-900 dark:text-white"}`}>{value}</p>
      {sub && <p className={`mt-0.5 text-[11px] ${highlight ? "text-amber-700/80" : "text-gray-400"}`}>{sub}</p>}
    </div>
  );
}
