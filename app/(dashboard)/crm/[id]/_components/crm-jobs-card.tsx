"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Trash2, Save, ExternalLink } from "lucide-react";
import type { LeadJobPosting } from "@/lib/types";
import { addJobPosting, deleteJobPosting } from "../../actions";
import { useToastContext } from "../../../toast-provider";
import { Card } from "./crm-shared";

export function CrmJobsCard({
  leadId, jobs, careerPageUrl,
}: { leadId: string; jobs: LeadJobPosting[]; careerPageUrl: string | null }) {
  const [adding, setAdding] = useState(false);

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Offene Stellen ({jobs.length})
        </h2>
        <div className="flex items-center gap-1">
          {careerPageUrl && (
            <a
              href={careerPageUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              Karriere
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
          <button
            onClick={() => setAdding(true)}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5 dark:hover:text-gray-200"
            title="Stelle hinzufügen"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {adding && <JobForm leadId={leadId} onClose={() => setAdding(false)} />}

      {jobs.length === 0 && !adding ? (
        <p className="mt-2 text-sm text-gray-400">Noch keine Stellen.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {jobs.map((j) => <li key={j.id}><JobRow job={j} leadId={leadId} /></li>)}
        </ul>
      )}
    </Card>
  );
}

function JobRow({ job, leadId }: { job: LeadJobPosting; leadId: string }) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`Stelle "${job.title}" wirklich löschen?`)) return;
    startTransition(async () => {
      const res = await deleteJobPosting(job.id, leadId);
      if (res.error) addToast(res.error, "error");
      else {
        addToast("Stelle gelöscht", "success");
        router.refresh();
      }
    });
  }

  return (
    <div className="group flex items-start justify-between gap-2 rounded-md border border-gray-100 p-2 dark:border-[#2c2c2e]">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{job.title}</p>
        {job.location && <p className="truncate text-xs text-gray-500 dark:text-gray-400">{job.location}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {job.url && (
          <a href={job.url} target="_blank" rel="noreferrer" className="rounded p-1 text-primary hover:bg-primary/10" title="Öffnen">
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
        <button
          onClick={handleDelete}
          disabled={pending}
          className="rounded p-1 text-gray-400 opacity-70 transition hover:bg-red-50 hover:text-red-600 hover:opacity-100 dark:hover:bg-red-900/20"
          title="Löschen"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function JobForm({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [url, setUrl] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!title.trim()) return;
    startTransition(async () => {
      const res = await addJobPosting({ leadId, title, location, url });
      if (res.error) addToast(res.error, "error");
      else {
        addToast("Stelle angelegt", "success");
        onClose();
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-2 rounded-md border border-primary/40 bg-primary/5 p-2 dark:bg-primary/10">
      <div className="space-y-1.5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titel (m/w/d) *"
          autoFocus
          className="w-full rounded-md border border-gray-200 bg-white p-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#161618]"
        />
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Ort"
          className="w-full rounded-md border border-gray-200 bg-white p-1.5 text-xs dark:border-[#2c2c2e] dark:bg-[#161618]"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Link zur Stellenanzeige"
          type="url"
          className="w-full rounded-md border border-gray-200 bg-white p-1.5 text-xs dark:border-[#2c2c2e] dark:bg-[#161618]"
        />
      </div>
      <div className="mt-2 flex justify-end gap-1">
        <button
          onClick={onClose}
          className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"
        >
          <X className="h-3 w-3" />
        </button>
        <button
          onClick={submit}
          disabled={pending || !title.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-gray-900 hover:bg-primary-dark disabled:opacity-50"
        >
          <Save className="h-3 w-3" />
          {pending ? "…" : "Anlegen"}
        </button>
      </div>
    </div>
  );
}
