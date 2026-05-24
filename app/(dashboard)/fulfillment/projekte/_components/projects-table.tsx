"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Briefcase, Loader2, Search, Trash2 } from "lucide-react";
import { deleteProject } from "../../actions";
import { useToastContext } from "../../../toast-provider";
import { ProjectStatusCell } from "./project-status-cell";
import { ProjectNameCell } from "./project-name-cell";
import { ProjectStartCell } from "./project-start-cell";
import type { ProjectStatus } from "@/lib/fulfillment/types";

type Row = {
  id: string;
  name: string;
  status: ProjectStatus;
  vertical: string | null;
  started_at: string | null;
  lead_id: string;
  customer: string;
};

export function ProjectsTable({ projects }: { projects: Row[] }) {
  const { addToast } = useToastContext();
  const [query, setQuery] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.customer.toLowerCase().includes(q) ||
        (p.vertical ?? "").toLowerCase().includes(q),
    );
  }, [projects, query]);

  function onDelete(id: string, name: string) {
    setPendingId(id);
    startTransition(async () => {
      const res = await deleteProject(id);
      setPendingId(null);
      setConfirmId(null);
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      addToast(`Projekt „${name}" gelöscht.`, "success");
    });
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Projekt, Kunde oder Bereich suchen..."
          className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-[#2c2c2e]/60 dark:bg-[#161618] dark:text-white"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-12 text-center dark:border-[#2c2c2e]/60">
          <Briefcase className="mx-auto h-8 w-8 text-gray-400" />
          <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-200">
            {query ? "Keine Treffer." : "Keine Projekte."}
          </p>
          {!query && (
            <p className="mt-1 text-xs text-gray-500">
              Lege ein Projekt direkt im Kunden-Profil an (Tab „Projekte").
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 dark:bg-[#1c1c1e]">
              <tr>
                <th className="px-4 py-3 text-left">Projekt</th>
                <th className="px-4 py-3 text-left">Kunde</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Bereich</th>
                <th className="px-4 py-3 text-left">Start</th>
                <th className="w-10 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-[#2c2c2e]/40">
              {filtered.map((p) => (
                <tr key={p.id} className="group hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <ProjectNameCell projectId={p.id} initial={p.name} />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/fulfillment/kunden/${p.lead_id}`}
                      className="text-gray-600 hover:text-primary dark:text-gray-300"
                    >
                      {p.customer}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <ProjectStatusCell projectId={p.id} current={p.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{p.vertical ?? "—"}</td>
                  <td className="px-4 py-3">
                    <ProjectStartCell projectId={p.id} initial={p.started_at} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {confirmId === p.id ? (
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onDelete(p.id, p.name)}
                          disabled={pendingId === p.id}
                          className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {pendingId === p.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Löschen"
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmId(null)}
                          disabled={pendingId === p.id}
                          className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"
                        >
                          Abbrechen
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmId(p.id)}
                        aria-label={`Projekt ${p.name} löschen`}
                        title="Projekt löschen"
                        className="rounded p-1 text-gray-400 opacity-50 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
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
