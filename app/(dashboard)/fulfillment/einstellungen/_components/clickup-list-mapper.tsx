"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import type { Project } from "@/lib/fulfillment/types";
import { mapListToProject } from "../actions";
import { useToastContext } from "../../../toast-provider";

export function ClickupListMapper({ projects }: { projects: Project[] }) {
  const { addToast } = useToastContext();
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(projects.map((p) => [p.id, p.clickup_list_id ?? ""])),
  );
  const [pending, startTransition] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);

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

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 dark:bg-[#1c1c1e]">
          <tr>
            <th className="px-4 py-3 text-left">Projekt</th>
            <th className="px-4 py-3 text-left">ClickUp List-ID</th>
            <th className="px-4 py-3 text-right">Aktion</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-[#2c2c2e]/40">
          {projects.map((p) => {
            const isDirty = (drafts[p.id] ?? "") !== (p.clickup_list_id ?? "");
            const isSaving = savingId === p.id && pending;
            return (
              <tr key={p.id}>
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{p.name}</td>
                <td className="px-4 py-3">
                  <input
                    value={drafts[p.id] ?? ""}
                    onChange={(e) => setDrafts({ ...drafts, [p.id]: e.target.value })}
                    placeholder="ClickUp List-ID"
                    className="w-48 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]"
                  />
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
  );
}
