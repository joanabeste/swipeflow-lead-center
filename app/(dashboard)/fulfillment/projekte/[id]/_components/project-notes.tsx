"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Send, X } from "lucide-react";
import type { ProjectNote } from "@/lib/fulfillment/types";
import { addProjectNote, deleteProjectNote, updateProjectNote } from "../actions";
import { useToastContext } from "../../../../toast-provider";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ProjectNotes({ projectId, notes, currentUserId }: { projectId: string; notes: ProjectNote[]; currentUserId: string | null }) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();

  function add() {
    const value = draft.trim();
    if (!value) return;
    startTransition(async () => {
      const res = await addProjectNote(projectId, value);
      if ("error" in res) addToast(res.error, "error");
      else {
        setDraft("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
        <label htmlFor="project-note-input" className="sr-only">Neue Notiz</label>
        <textarea
          id="project-note-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              add();
            }
          }}
          rows={3}
          placeholder="Neue Notiz zum Projekt … (⌘/Ctrl + Enter speichert)"
          className="block w-full resize-y rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={add}
            disabled={!draft.trim() || pending}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" /> {pending ? "Speichern…" : "Notiz speichern"}
          </button>
        </div>
      </div>

      {notes.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400 dark:border-[#2c2c2e]/60">
          Noch keine Notizen. Halte hier Status-Updates, Absprachen oder Reminder fest.
        </p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id}>
              <NoteRow note={n} projectId={projectId} canEdit={n.created_by === currentUserId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NoteRow({ note, projectId, canEdit }: { note: ProjectNote; projectId: string; canEdit: boolean }) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.content);
  const [pending, startTransition] = useTransition();

  function save() {
    const value = draft.trim();
    if (!value) {
      addToast("Notiz darf nicht leer sein.", "error");
      return;
    }
    startTransition(async () => {
      const res = await updateProjectNote(note.id, projectId, value);
      if ("error" in res) addToast(res.error, "error");
      else {
        setEditing(false);
        router.refresh();
      }
    });
  }

  function del() {
    if (!confirm("Notiz wirklich löschen?")) return;
    startTransition(async () => {
      const res = await deleteProjectNote(note.id, projectId);
      if ("error" in res) addToast(res.error, "error");
      else router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs text-gray-500 dark:text-gray-400">
          <span className="font-medium text-gray-700 dark:text-gray-200">{note.author_name ?? "Unbekannt"}</span>
          <span className="mx-1.5">·</span>
          {formatWhen(note.created_at)}
          {note.updated_at !== note.created_at && <span className="ml-1.5 text-gray-400">(bearb.)</span>}
        </div>
        {canEdit && !editing && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setEditing(true)}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5"
              title="Bearbeiten"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={del}
              disabled={pending}
              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-900/20"
              title="Löschen"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      {editing ? (
        <div className="mt-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="block w-full resize-y rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setEditing(false); setDraft(note.content); }}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-md px-3 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"
            >
              <X className="h-3 w-3" /> Abbrechen
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-md bg-gray-900 px-3 py-1 text-xs text-white disabled:opacity-50 dark:bg-white dark:text-gray-900"
            >
              {pending ? "Speichern…" : "Speichern"}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">{note.content}</p>
      )}
    </div>
  );
}
