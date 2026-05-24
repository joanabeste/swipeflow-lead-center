import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadProject, loadCustomer, loadCachedTasks, loadProjectNotes } from "@/lib/fulfillment/data";
import { PROJECT_STATUS_COLORS, PROJECT_STATUS_LABELS } from "@/lib/fulfillment/types";
import { formatDateDe } from "@/lib/zeit/format";
import { ProjectStatusEditor } from "./_components/status-editor";
import { TaskList } from "./_components/task-list";
import { ProjectNotes } from "./_components/project-notes";
import { ProjectMails } from "./_components/project-mails";
import { loadThreadsForProject } from "@/lib/email/data";

export default async function ProjektDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await loadProject(id);
  if (!project) notFound();
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  const [customer, tasks, notes, threads] = await Promise.all([
    loadCustomer(project.lead_id),
    loadCachedTasks(id),
    loadProjectNotes(id),
    loadThreadsForProject(id).catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <Link href="/fulfillment/projekte" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Zurueck zu Projekte
      </Link>

      <header className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${PROJECT_STATUS_COLORS[project.status]}`}>
              {PROJECT_STATUS_LABELS[project.status]}
            </span>
            <h1 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{project.name}</h1>
            <div className="mt-2 text-sm text-gray-500">
              Kunde:{" "}
              <Link href={`/fulfillment/kunden/${project.lead_id}`} className="text-primary hover:underline">
                {customer?.company_name ?? project.lead_id}
              </Link>
              {project.vertical && <span className="ml-3 text-xs uppercase tracking-wider text-gray-400">{project.vertical}</span>}
            </div>
            <div className="mt-1 text-xs text-gray-400">
              {project.started_at && <span>Start: {formatDateDe(project.started_at)} · </span>}
              {project.completed_at && <span>Ende: {formatDateDe(project.completed_at)}</span>}
            </div>
          </div>
          <ProjectStatusEditor projectId={project.id} current={project.status} />
        </div>
        {project.notes && (
          <p className="mt-4 whitespace-pre-wrap rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:bg-[#1c1c1e] dark:text-gray-300">
            {project.notes}
          </p>
        )}
      </header>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">Notizen</h2>
        <ProjectNotes projectId={project.id} notes={notes} currentUserId={user?.id ?? null} />
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">E-Mails</h2>
        <ProjectMails projectId={project.id} leadId={project.lead_id} threads={threads} />
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">ClickUp-Tasks</h2>
        <TaskList projectId={project.id} clickupListId={project.clickup_list_id} initialTasks={tasks} />
      </section>
    </div>
  );
}
