"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, RefreshCw } from "lucide-react";
import type { Project } from "@/lib/fulfillment/types";
import { loadClickupLists, mapListToProject, type ClickupListChoice } from "../actions";
import { useToastContext } from "../../../toast-provider";

export function ClickupListMapper({ projects }: { projects: Project[] }) {
  const { addToast } = useToastContext();
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(projects.map((p) => [p.id, p.clickup_list_id ?? ""])),
  );
  const [pending, startTransition] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [lists, setLists] = useState<ClickupListChoice[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingLists, startLoadingLists] = useTransition();

  function loadLists() {
    setLoadError(null);
    startLoadingLists(async () => {
      const res = await loadClickupLists();
      if ("error" in res) {
        setLoadError(res.error);
        setLists([]);
      } else {
        setLists(res.lists);
      }
    });
  }

  useEffect(() => {
    loadLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function save(projectId: string) {
    const listId = drafts[projectId]?.trim() || null;
    setSavingId(projectId);
    startTransition(async () => {
      const res = await mapListToProject(projectId, listId);
      if ("error" in res) addToast(res.error, "error");
      else addToast(listId ? "Liste verknuepft + Tasks synchronisiert." : "Verknuepfung entfernt.", "success");
      setSavingId(null);
    });
  }

  if (projects.length === 0) {
    return <p className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400 dark:border-[#2c2c2e]/60">Noch keine Projekte. Lege erst Projekte unter Kunden an.</p>;
  }

  const listById = new Map(lists?.map((l) => [l.id, l]) ?? []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <p className="text-gray-500 dark:text-gray-400">
          {loadingLists
            ? "Lade Listen aus ClickUp…"
            : loadError
            ? <span className="text-red-500">Fehler beim Laden: {loadError}</span>
            : lists
            ? `${lists.length} Listen aus deinem Workspace verfügbar.`
            : ""}
        </p>
        <button
          type="button"
          onClick={loadLists}
          disabled={loadingLists}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-[#2c2c2e]/60 dark:text-gray-300 dark:hover:bg-white/5"
        >
          <RefreshCw className={`h-3 w-3 ${loadingLists ? "animate-spin" : ""}`} /> Neu laden
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 dark:bg-[#1c1c1e]">
            <tr>
              <th className="px-4 py-3 text-left">Projekt</th>
              <th className="px-4 py-3 text-left">ClickUp-Liste</th>
              <th className="px-4 py-3 text-right">Aktion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-[#2c2c2e]/40">
            {projects.map((p) => {
              const currentDraft = drafts[p.id] ?? "";
              const isDirty = currentDraft !== (p.clickup_list_id ?? "");
              const isSaving = savingId === p.id && pending;
              const knownInList = currentDraft ? listById.has(currentDraft) : true;
              return (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{p.name}</td>
                  <td className="px-4 py-3">
                    <select
                      value={currentDraft}
                      onChange={(e) => setDrafts({ ...drafts, [p.id]: e.target.value })}
                      disabled={loadingLists}
                      className="w-72 max-w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs disabled:opacity-50 dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]"
                    >
                      <option value="">— keine —</option>
                      {!knownInList && currentDraft && (
                        <option value={currentDraft}>⚠ {currentDraft} (nicht in ClickUp gefunden)</option>
                      )}
                      {lists?.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.spaceName}{l.folderName ? ` › ${l.folderName}` : ""} › {l.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => save(p.id)}
                      disabled={!isDirty || isSaving}
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-gray-900 hover:bg-primary-dark disabled:opacity-40"
                    >
                      <Check className="h-3.5 w-3.5" /> {isSaving ? "…" : "Speichern"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
