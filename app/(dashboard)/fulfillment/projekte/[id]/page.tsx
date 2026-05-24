import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { loadProject, loadCustomer, loadCachedTasks, loadProjectNotes } from "@/lib/fulfillment/data";
import { PROJECT_STATUS_COLORS, PROJECT_STATUS_LABELS } from "@/lib/fulfillment/types";
import { formatDateDe } from "@/lib/zeit/format";
import { ProjectStatusEditor } from "./_components/status-editor";
import { TaskList } from "./_components/task-list";
import { ProjectNotes } from "./_components/project-notes";
import { ProjectMailsTab } from "./_components/project-mails-tab";
import { ProjectTabSwitcher, type ProjectTab } from "./_components/project-tab-switcher";
import { loadThreadsForProject } from "@/lib/email/data";

function isTab(s: string | undefined): s is ProjectTab {
  return s === "uebersicht" || s === "tasks" || s === "mails" || s === "notizen";
}

export default async function ProjektDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; closed?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: ProjectTab = isTab(sp.tab) ? sp.tab : "uebersicht";

  const project = await loadProject(id);
  if (!project) notFound();
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  const customer = await loadCustomer(project.lead_id);

  // Default-To fuer Compose im Mails-Tab: primaerer Kontakt → erster Kontakt → Lead-Email.
  let defaultTo: string | null = null;
  if (tab === "mails") {
    const db = createServiceClient();
    const { data: contacts } = await db
      .from("customer_contacts")
      .select("email, is_primary")
      .eq("lead_id", project.lead_id)
      .order("is_primary", { ascending: false });
    const primary = (contacts ?? []).find((c) => c.is_primary && c.email);
    const any = (contacts ?? []).find((c) => c.email);
    defaultTo = (primary?.email as string | null) ?? (any?.email as string | null) ?? (customer?.email as string | null) ?? null;
  }

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

      <ProjectTabSwitcher current={tab} basePath={`/fulfillment/projekte/${id}`} />

      {tab === "uebersicht" && await (async () => {
        const [tasks, threadCount] = await Promise.all([
          loadCachedTasks(id, false),
          loadThreadsForProject(id).then((t) => t.length).catch(() => 0),
        ]);
        const openTasks = tasks.filter((t) => !t.closed).length;
        return (
          <section className="grid gap-3 sm:grid-cols-3">
            <Stat label="Offene Tasks" value={String(openTasks)} href={`/fulfillment/projekte/${id}?tab=tasks`} />
            <Stat label="E-Mail-Threads" value={String(threadCount)} href={`/fulfillment/projekte/${id}?tab=mails`} />
            <Stat label="Status" value={PROJECT_STATUS_LABELS[project.status]} href={null} />
          </section>
        );
      })()}

      {tab === "tasks" && await (async () => {
        const tasks = await loadCachedTasks(id, true);
        return (
          <section>
            <TaskList projectId={project.id} clickupListId={project.clickup_list_id} initialTasks={tasks} />
          </section>
        );
      })()}

      {tab === "mails" && await (async () => {
        const threads = await loadThreadsForProject(id).catch(() => []);
        return (
          <section>
            <ProjectMailsTab projectId={project.id} leadId={project.lead_id} initialThreads={threads} defaultTo={defaultTo} />
          </section>
        );
      })()}

      {tab === "notizen" && await (async () => {
        const notes = await loadProjectNotes(id);
        return (
          <section>
            <ProjectNotes projectId={project.id} notes={notes} currentUserId={user?.id ?? null} />
          </section>
        );
      })()}
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: string; href: string | null }) {
  const content = (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
      <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}
