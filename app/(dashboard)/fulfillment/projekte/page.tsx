import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { listAllProjects, listCustomers } from "@/lib/fulfillment/data";
import { type ProjectStatus } from "@/lib/fulfillment/types";
import { ProjectsTable } from "./_components/projects-table";
import { NewProjectButton } from "./_components/new-project-button";

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
  const [projectsRaw, customers] = await Promise.all([
    listAllProjects(status ? { status } : undefined),
    listCustomers(),
  ]);
  const statusOrder: Record<ProjectStatus, number> = { active: 0, onboarding: 1, paused: 2, completed: 3 };
  const projects = status
    ? projectsRaw
    : [...projectsRaw].sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  const db = createServiceClient();
  const ids = [...new Set(projects.map((p) => p.lead_id))];
  const { data: leads } = ids.length
    ? await db.from("leads").select("id, company_name").in("id", ids)
    : { data: [] };
  const nameByLead = new Map((leads ?? []).map((l: { id: string; company_name: string }) => [l.id, l.company_name]));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Projekte</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{projects.length} Projekte ueber alle Kunden</p>
        </div>
        <NewProjectButton
          customers={customers
            .map((c) => ({ id: c.id, name: c.company_name ?? "—" }))
            .sort((a, b) => a.name.localeCompare(b.name, "de"))}
        />
      </div>

      <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#161618]">
        {STATUS_OPTIONS.map((o) => {
          const active = (o.id === "all" && !status) || o.id === status;
          return (
            <Link
              key={o.id}
              href={o.id === "all" ? "/fulfillment/projekte" : `/fulfillment/projekte?status=${o.id}`}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${active ? "bg-primary text-gray-900 shadow-sm" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"}`}
            >
              {o.label}
            </Link>
          );
        })}
      </div>

      <ProjectsTable
        projects={projects.map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          vertical: p.vertical,
          started_at: p.started_at,
          lead_id: p.lead_id,
          customer: nameByLead.get(p.lead_id) ?? "—",
        }))}
      />
    </div>
  );
}
