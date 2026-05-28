"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, Trash2, Search, X, CheckSquare, Check } from "lucide-react";
import type { ClickupTaskCached } from "@/lib/fulfillment/types";
import { formatDateDe } from "@/lib/zeit/format";
import { useToastContext } from "../../../toast-provider";
import { closeClickupTask, deleteClickupTask } from "../../projekte/[id]/actions";

type Task = ClickupTaskCached & { project_name?: string; customer_name?: string };
type StateFilter = "open" | "closed" | "all";

export function TasksView({ tasks }: { tasks: Task[] }) {
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [project, setProject] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [state, setState] = useState<StateFilter>("open");

  const projects = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tasks) {
      if (t.project_id && t.project_name) map.set(t.project_id, t.project_name);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [tasks]);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) if (t.status) set.add(t.status);
    return Array.from(set).sort();
  }, [tasks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (state === "open" && t.closed) return false;
      if (state === "closed" && !t.closed) return false;
      if (project !== "all" && t.project_id !== project) return false;
      if (status !== "all" && t.status !== status) return false;
      if (q) {
        const hay = `${t.name} ${t.project_name ?? ""} ${t.customer_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, search, project, status, state]);

  function resetFilters() {
    setSearch("");
    setProject("all");
    setStatus("all");
    setState("open");
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`Task „${name}“ wirklich loeschen? Wird auch in ClickUp geloescht.`)) return;
    startTransition(async () => {
      const res = await deleteClickupTask(id);
      if ("error" in res) addToast(res.error, "error");
      else addToast("Task geloescht.", "success");
    });
  }

  function handleClose(id: string) {
    startTransition(async () => {
      const res = await closeClickupTask(id);
      if ("error" in res) addToast(res.error, "error");
      else addToast("Task geschlossen.", "success");
    });
  }

  const filtersActive = search !== "" || project !== "all" || status !== "all" || state !== "open";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">ClickUp-Tasks</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {filtered.length} von {tasks.length} Tasks{filtersActive ? " (gefiltert)" : ""}
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-3 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Suche (Task, Projekt, Kunde)…"
              className="w-full rounded-xl border border-gray-200 bg-white py-1.5 pl-9 pr-3 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]"
            />
          </div>

          <select
            value={state}
            onChange={(e) => setState(e.target.value as StateFilter)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]"
          >
            <option value="open">Offen</option>
            <option value="closed">Erledigt</option>
            <option value="all">Alle</option>
          </select>

          <select
            value={project}
            onChange={(e) => setProject(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]"
          >
            <option value="all">Alle Projekte</option>
            {projects.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]"
          >
            <option value="all">Alle Status</option>
            {statuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {filtersActive && (
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 dark:border-[#2c2c2e]/60 dark:text-gray-300 dark:hover:bg-white/5"
            >
              <X className="h-3.5 w-3.5" /> Zuruecksetzen
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-12 text-center dark:border-[#2c2c2e]/60">
          <CheckSquare className="mx-auto h-8 w-8 text-gray-400" />
          <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-200">
            {tasks.length === 0 ? "Keine Tasks." : "Keine Treffer fuer den Filter."}
          </p>
          {tasks.length === 0 && (
            <p className="mt-1 text-xs text-gray-500">Verknuepfe ein Projekt mit einer ClickUp-Liste und ziehe die Tasks via &bdquo;Sync&ldquo;.</p>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 dark:bg-[#1c1c1e]">
              <tr>
                <th className="px-4 py-3 text-left">Task</th>
                <th className="px-4 py-3 text-left">Kunde / Projekt</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Faellig</th>
                <th className="px-4 py-3 text-right">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-[#2c2c2e]/40">
              {filtered.map((t) => (
                <tr key={t.clickup_task_id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{t.name}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {t.customer_name && <span>{t.customer_name}</span>}
                    {t.customer_name && t.project_name && " · "}
                    {t.project_name && (
                      <Link href={`/fulfillment/projekte/${t.project_id}`} className="text-primary hover:underline">{t.project_name}</Link>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {t.status && (
                      <span style={{ color: t.status_color ?? undefined }} className="text-xs font-semibold uppercase tracking-wider">{t.status}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{t.due_date ? formatDateDe(t.due_date) : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      {!t.closed && (
                        <button
                          onClick={() => handleClose(t.clickup_task_id)}
                          disabled={pending}
                          title="Als erledigt markieren"
                          className="rounded-md p-1 text-gray-400 hover:bg-green-50 hover:text-green-600 disabled:opacity-50 dark:hover:bg-green-500/10"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      )}
                      {t.url && (
                        <a href={t.url} target="_blank" rel="noreferrer" title="In ClickUp oeffnen" className="inline-block rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      <button
                        onClick={() => handleDelete(t.clickup_task_id, t.name)}
                        disabled={pending}
                        title="Task loeschen"
                        className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
