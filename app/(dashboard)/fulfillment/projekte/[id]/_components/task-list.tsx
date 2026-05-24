"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { RefreshCw, Plus, ExternalLink, Check } from "lucide-react";
import type { ClickupTaskCached } from "@/lib/fulfillment/types";
import { useToastContext } from "../../../../toast-provider";
import { closeClickupTask, createClickupTask, syncClickupTasks } from "../actions";
import { formatDateDe } from "@/lib/zeit/format";

export function TaskList({
  projectId,
  clickupListId,
  initialTasks,
}: {
  projectId: string;
  clickupListId: string | null;
  initialTasks: ClickupTaskCached[];
}) {
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({ name: "", description: "" });

  if (!clickupListId) {
    return (
      <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/50 p-6 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/10 dark:text-amber-300">
        Dieses Projekt ist noch nicht mit einer ClickUp-Liste verknuepft.{" "}
        <Link href="/fulfillment/einstellungen" className="underline">In den Einstellungen mappen.</Link>
      </div>
    );
  }

  function refresh() {
    startTransition(async () => {
      const res = await syncClickupTasks(projectId);
      if ("error" in res) addToast(res.error, "error");
      else addToast(`${res.data?.count ?? 0} Tasks synchronisiert.`, "success");
    });
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) return;
    startTransition(async () => {
      const res = await createClickupTask(projectId, { name: draft.name, description: draft.description });
      if ("error" in res) addToast(res.error, "error");
      else {
        addToast("Task angelegt.", "success");
        setDraft({ name: "", description: "" });
        setShowAdd(false);
      }
    });
  }

  function close(id: string) {
    startTransition(async () => {
      const res = await closeClickupTask(id);
      if ("error" in res) addToast(res.error, "error");
      else addToast("Task geschlossen.", "success");
    });
  }

  const openTasks = initialTasks.filter((t) => !t.closed);
  const closedTasks = initialTasks.filter((t) => t.closed);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500">
          {openTasks.length} offen{closedTasks.length > 0 ? ` · ${closedTasks.length} erledigt` : ""}
        </p>
        <div className="flex items-center gap-2">
          <button onClick={refresh} disabled={pending} className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium hover:bg-gray-100 disabled:opacity-50 dark:border-[#2c2c2e]/60 dark:hover:bg-white/5">
            <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} /> Sync
          </button>
          <button onClick={() => setShowAdd((v) => !v)} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-primary-dark">
            <Plus className="h-3.5 w-3.5" /> Neue Aufgabe
          </button>
        </div>
      </div>

      {showAdd && (
        <form onSubmit={handleCreate} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Aufgaben-Name" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]" required />
          <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={2} placeholder="Beschreibung (optional)" className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]" />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowAdd(false)} className="rounded-xl border border-gray-200 px-3 py-1 text-xs hover:bg-gray-100 dark:border-[#2c2c2e]/60 dark:hover:bg-white/5">Abbrechen</button>
            <button type="submit" disabled={pending} className="rounded-xl bg-primary px-3 py-1 text-xs font-semibold text-gray-900 hover:bg-primary-dark disabled:opacity-50">{pending ? "Anlegen…" : "Anlegen"}</button>
          </div>
        </form>
      )}

      {initialTasks.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400 dark:border-[#2c2c2e]/60">
          Keine Tasks. Mit Sync aus ClickUp ziehen oder neue Aufgabe anlegen.
        </p>
      ) : (
        <>
          {openTasks.length > 0 && (
            <ul className="space-y-2">
              {openTasks.map((t) => (
                <TaskRow key={t.clickup_task_id} task={t} pending={pending} onClose={close} />
              ))}
            </ul>
          )}

          {openTasks.length === 0 && closedTasks.length > 0 && (
            <p className="rounded-2xl border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400 dark:border-[#2c2c2e]/60">
              Keine offenen Tasks — alles erledigt 🎉
            </p>
          )}

          {closedTasks.length > 0 && (
            <div className="space-y-2 pt-4">
              <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Erledigt ({closedTasks.length})
              </p>
              <ul className="space-y-2">
                {closedTasks.map((t) => (
                  <TaskRow key={t.clickup_task_id} task={t} pending={pending} onClose={close} />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TaskRow({
  task: t,
  pending,
  onClose,
}: {
  task: ClickupTaskCached;
  pending: boolean;
  onClose: (id: string) => void;
}) {
  return (
    <li
      className={`flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 dark:border-[#2c2c2e]/50 dark:bg-[#161618] ${t.closed ? "opacity-60" : ""}`}
    >
      {t.closed ? (
        <span className="rounded-full border-2 border-green-500 bg-green-50 p-0.5 dark:bg-green-900/30" title="Erledigt">
          <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
        </span>
      ) : (
        <button
          onClick={() => onClose(t.clickup_task_id)}
          disabled={pending}
          className="rounded-full border-2 border-gray-300 p-0.5 hover:border-green-500 hover:bg-green-50"
          title="Als erledigt markieren"
        >
          <Check className="h-3 w-3 text-transparent hover:text-green-500" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <p className={`truncate font-medium text-gray-900 dark:text-white ${t.closed ? "line-through" : ""}`}>{t.name}</p>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500">
          {t.status && (
            <span style={{ color: t.status_color ?? undefined }} className="font-semibold uppercase tracking-wider">
              {t.status}
            </span>
          )}
          {t.due_date && <span>Faellig: {formatDateDe(t.due_date)}</span>}
          {t.assignees && t.assignees.length > 0 && (
            <span>{t.assignees.map((a) => a.username ?? a.email ?? a.id).join(", ")}</span>
          )}
        </div>
      </div>
      {t.url && (
        <a
          href={t.url}
          target="_blank"
          rel="noreferrer"
          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5"
          title="In ClickUp oeffnen"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      )}
    </li>
  );
}
