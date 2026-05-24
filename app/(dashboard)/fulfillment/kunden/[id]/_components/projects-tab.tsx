"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus, ExternalLink } from "lucide-react";
import type { Project, ProjectStatus } from "@/lib/fulfillment/types";
import { PROJECT_STATUS_COLORS, PROJECT_STATUS_LABELS } from "@/lib/fulfillment/types";
import { createProject } from "../../../actions";
import { useToastContext } from "../../../../toast-provider";
import { formatDateDe } from "@/lib/zeit/format";

export function ProjectsTab({ leadId, projects }: { leadId: string; projects: Project[] }) {
  const { addToast } = useToastContext();
  const [showAdd, setShowAdd] = useState(false);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<{ name: string; vertical: "" | "webdesign" | "recruiting" | "sonstiges"; status: ProjectStatus; started_at: string; notes: string }>(
    { name: "", vertical: "", status: "onboarding", started_at: new Date().toISOString().slice(0, 10), notes: "" },
  );

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) {
      addToast("Projekt-Name fehlt.", "error");
      return;
    }
    startTransition(async () => {
      const res = await createProject({
        lead_id: leadId,
        name: draft.name,
        status: draft.status,
        vertical: draft.vertical || undefined,
        started_at: draft.started_at || undefined,
        notes: draft.notes || undefined,
      });
      if ("error" in res) addToast(res.error, "error");
      else {
        addToast("Projekt angelegt.", "success");
        setDraft({ name: "", vertical: "", status: "onboarding", started_at: new Date().toISOString().slice(0, 10), notes: "" });
        setShowAdd(false);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          {projects.length} {projects.length === 1 ? "Projekt" : "Projekte"}
        </h2>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-primary-dark"
        >
          <Plus className="h-3.5 w-3.5" /> Neues Projekt
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Projekt-Name *">
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputCls} required />
            </Field>
            <Field label="Bereich">
              <select value={draft.vertical} onChange={(e) => setDraft({ ...draft, vertical: e.target.value as "" | "webdesign" | "recruiting" | "sonstiges" })} className={inputCls}>
                <option value="">—</option>
                <option value="webdesign">Webdesign</option>
                <option value="recruiting">Recruiting</option>
                <option value="sonstiges">Sonstiges</option>
              </select>
            </Field>
            <Field label="Status">
              <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as ProjectStatus })} className={inputCls}>
                <option value="onboarding">Onboarding</option>
                <option value="active">Aktiv</option>
                <option value="paused">Pausiert</option>
                <option value="completed">Abgeschlossen</option>
              </select>
            </Field>
            <Field label="Start-Datum">
              <input type="date" value={draft.started_at} onChange={(e) => setDraft({ ...draft, started_at: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Notiz" full>
              <textarea rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className={inputCls} />
            </Field>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setShowAdd(false)} className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-[#2c2c2e]/60 dark:hover:bg-white/5">Abbrechen</button>
            <button type="submit" disabled={pending} className="rounded-xl bg-primary px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-primary-dark disabled:opacity-50">{pending ? "Speichern…" : "Anlegen"}</button>
          </div>
        </form>
      )}

      {projects.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400 dark:border-[#2c2c2e]/60">
          Noch keine Projekte fuer diesen Kunden.
        </p>
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <Link href={`/fulfillment/projekte/${p.id}`} className="font-semibold text-gray-900 hover:text-primary dark:text-white">
                    {p.name}
                  </Link>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${PROJECT_STATUS_COLORS[p.status]}`}>
                    {PROJECT_STATUS_LABELS[p.status]}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                  {p.vertical && <span>{p.vertical}</span>}
                  {p.started_at && <span>Start: {formatDateDe(p.started_at)}</span>}
                  {p.completed_at && <span>Ende: {formatDateDe(p.completed_at)}</span>}
                </div>
              </div>
              <Link href={`/fulfillment/projekte/${p.id}`} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5">
                <ExternalLink className="h-4 w-4" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e] dark:text-gray-100";

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="block text-xs font-medium uppercase tracking-wider text-gray-400">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
