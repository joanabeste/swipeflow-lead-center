import Link from "next/link";
import { Briefcase } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import { listAllProjects } from "@/lib/fulfillment/data";
import { PROJECT_STATUS_COLORS, PROJECT_STATUS_LABELS, type ProjectStatus } from "@/lib/fulfillment/types";
import { formatDateDe } from "@/lib/zeit/format";

const STATUS_OPTIONS: Array<{ id: ProjectStatus | "all"; label: string }> = [
  { id: "all", label: "Alle" },
  { id: "onboarding", label: "Onboarding" },
  { id: "active", label: "Aktiv" },
  { id: "paused", label: "Pausiert" },
  { id: "completed", label: "Abgeschlossen" },
];

export default async function ProjekteListePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const status = sp.status && STATUS_OPTIONS.some((o) => o.id === sp.status) ? (sp.status as ProjectStatus) : undefined;
  const projects = await listAllProjects(status ? { status } : undefined);

  const db = createServiceClient();
  const ids = [...new Set(projects.map((p) => p.lead_id))];
  const { data: leads } = ids.length
    ? await db.from("leads").select("id, company_name").in("id", ids)
    : { data: [] };
  const nameByLead = new Map((leads ?? []).map((l: { id: string; company_name: string }) => [l.id, l.company_name]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Projekte</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{projects.length} Projekte ueber alle Kunden</p>
      </div>

      <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#161618]">
        {STATUS_OPTIONS.map((o) => {
          const active = (o.id === "all" && !status) || o.id === status;
          return (
            <Link
              key={o.id}
              href={o.id === "all" ? "/fulfillment/projekte" : `/fulfillment/projekte?status=${o.id}`}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${active ? "bg-primary text-white shadow-sm" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"}`}
            >
              {o.label}
            </Link>
          );
        })}
      </div>

      {projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-12 text-center dark:border-[#2c2c2e]/60">
          <Briefcase className="mx-auto h-8 w-8 text-gray-400" />
          <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-200">Keine Projekte.</p>
          <p className="mt-1 text-xs text-gray-500">Lege ein Projekt direkt im Kunden-Profil an (Tab „Projekte").</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 dark:bg-[#1c1c1e]">
              <tr>
                <th className="px-4 py-3 text-left">Projekt</th>
                <th className="px-4 py-3 text-left">Kunde</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Vertikale</th>
                <th className="px-4 py-3 text-left">Start</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-[#2c2c2e]/40">
              {projects.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <Link href={`/fulfillment/projekte/${p.id}`} className="font-medium text-gray-900 hover:text-primary dark:text-white">{p.name}</Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/fulfillment/kunden/${p.lead_id}`} className="text-gray-600 hover:text-primary dark:text-gray-300">
                      {nameByLead.get(p.lead_id) ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${PROJECT_STATUS_COLORS[p.status]}`}>
                      {PROJECT_STATUS_LABELS[p.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{p.vertical ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{p.started_at ? formatDateDe(p.started_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
