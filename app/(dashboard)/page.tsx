import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FileSpreadsheet, Upload, Send, Sparkles } from "lucide-react";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [
    { count: totalLeads },
    { count: importedLeads },
    { count: enrichedLeads },
    { count: qualifiedLeads },
    { count: exportedLeads },
    { count: cancelledLeads },
    { count: filteredLeads },
    { data: recentLeads },
    { data: recentLogs },
  ] = await Promise.all([
    supabase.from("leads").select("*", { count: "exact", head: true }),
    supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "imported"),
    supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "enriched"),
    supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "qualified"),
    supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "exported"),
    supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "cancelled"),
    supabase.from("leads").select("*", { count: "exact", head: true }).eq("blacklist_hit", true),
    supabase.from("leads").select("id, company_name, status, updated_at").order("updated_at", { ascending: false }).limit(8),
    supabase.from("audit_logs").select("*, profiles(name)").order("created_at", { ascending: false }).limit(6),
  ]);

  const pipeline = [
    { label: "Importiert", value: importedLeads ?? 0, color: "bg-gray-400" },
    { label: "Angereichert", value: enrichedLeads ?? 0, color: "bg-blue-500" },
    { label: "Qualifiziert", value: qualifiedLeads ?? 0, color: "bg-green-500" },
    { label: "Exportiert", value: exportedLeads ?? 0, color: "bg-purple-500" },
    { label: "Ausgeschlossen", value: (cancelledLeads ?? 0) + (filteredLeads ?? 0), color: "bg-orange-500" },
  ];

  const total = totalLeads ?? 1;
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
    "lead.enriched_and_cancelled": "Lead angereichert & ausgeschlossen",
    "lead.updated": "Lead aktualisiert",
    "lead.bulk_status_update": "Status geändert",
    "lead.deleted": "Lead gelöscht",
    "export.success": "Export erfolgreich",
    "import.completed": "Import abgeschlossen",
    "import.url": "URL-Import",
    "import.directory": "Verzeichnis-Import",
  };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Übersicht</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Lead-Pipeline auf einen Blick
      </p>

      {/* Pipeline */}
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800/50 dark:bg-[#111827]">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Pipeline</p>
          <p className="text-sm font-bold">{totalLeads ?? 0} Leads</p>
        </div>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          {pipeline.map((s) => (
            s.value > 0 && (
              <div
                key={s.label}
                className={`${s.color} transition-all`}
                style={{ width: `${(s.value / total) * 100}%` }}
                title={`${s.label}: ${s.value}`}
              />
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
      </div>

      {/* Quick Actions */}
      <div className="mt-4 grid grid-cols-4 gap-3">
        {[
          { href: "/leads", icon: FileSpreadsheet, label: "Leads", sub: `${totalLeads ?? 0} gesamt`, accent: "text-primary" },
          { href: "/import", icon: Upload, label: "Import", sub: "CSV, URL, Verzeichnis", accent: "text-primary" },
          { href: "/leads?status=imported", icon: Sparkles, label: "Anreichern", sub: `${importedLeads ?? 0} wartend`, accent: "text-amber-500" },
          { href: "/export", icon: Send, label: "Export", sub: `${qualifiedLeads ?? 0} bereit`, accent: "text-green-500" },
        ].map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-primary/40 dark:border-gray-800/50 dark:bg-[#111827] dark:hover:border-primary/40"
          >
            <a.icon className={`h-5 w-5 ${a.accent}`} />
            <div>
              <p className="text-sm font-medium">{a.label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{a.sub}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Zwei-Spalten */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800/50 dark:bg-[#111827]">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 dark:border-gray-800/50">
            <h2 className="text-sm font-medium">Zuletzt bearbeitet</h2>
            <Link href="/leads" className="text-xs text-primary hover:underline">Alle anzeigen</Link>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
            {(recentLeads ?? []).map((lead) => {
              const s = statusLabels[lead.status] ?? { label: lead.status, color: "bg-gray-100 text-gray-700" };
              return (
                <Link
                  key={lead.id}
                  href={`/leads/${lead.id}`}
                  className="flex items-center justify-between px-5 py-3 transition hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                >
                  <span className="text-sm font-medium">{lead.company_name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.color}`}>{s.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800/50 dark:bg-[#111827]">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 dark:border-gray-800/50">
            <h2 className="text-sm font-medium">Letzte Aktivitäten</h2>
            <Link href="/aktivitaet" className="text-xs text-primary hover:underline">Alle anzeigen</Link>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
            {(recentLogs ?? []).map((log) => (
              <div key={log.id} className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{actionLabels[log.action] ?? log.action}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(log.created_at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {(log.profiles as { name: string } | null)?.name ?? "System"}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
