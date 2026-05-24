"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Send, X, Paperclip, FileText, Image as ImageIcon } from "lucide-react";
import type { ProjectNote, LoadedProjectNoteAttachment } from "@/lib/fulfillment/types";
import { NOTE_ATTACHMENT_ACCEPT, formatBytes, isImageMime } from "@/lib/notes/format";
import { uploadProjectAttachmentToTicket } from "@/lib/project-notes/client-upload";
import {
  addProjectNote, createProjectNoteUploads, deleteProjectNote, updateProjectNote,
} from "../actions";
import type { UploadedAttachmentRef } from "@/lib/project-notes/attachments";
import { useToastContext } from "../../../../toast-provider";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

async function uploadFiles(projectId: string, files: File[], onError: (msg: string) => void): Promise<UploadedAttachmentRef[]> {
  if (files.length === 0) return [];
  const meta = files.map((f, i) => ({
    clientId: `${i}-${f.name}`,
    fileName: f.name,
    mimeType: f.type || "application/octet-stream",
    sizeBytes: f.size,
  }));
  const ticketRes = await createProjectNoteUploads(projectId, meta);
  if ("error" in ticketRes) {
    onError(ticketRes.error);
    return [];
  }
  for (const err of ticketRes.errors) onError(err.error);
  const ticketByClientId = new Map(ticketRes.tickets.map((t) => [t.clientId, t]));
  const refs: UploadedAttachmentRef[] = [];
  for (let i = 0; i < files.length; i++) {
    const ticket = ticketByClientId.get(`${i}-${files[i].name}`);
    if (!ticket) continue;
    const up = await uploadProjectAttachmentToTicket(ticket, files[i]);
    if ("error" in up) onError(`${files[i].name}: ${up.error}`);
    else refs.push(up.ref);
  }
  return refs;
}

export function ProjectNotes({ projectId, notes, currentUserId }: { projectId: string; notes: ProjectNote[]; currentUserId: string | null }) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [draft, setDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    const arr = Array.from(list);
    if (arr.length === 0) return;
    setPendingFiles((cur) => [...cur, ...arr]);
  }

  function removePendingFile(idx: number) {
    setPendingFiles((cur) => cur.filter((_, i) => i !== idx));
  }

  function add() {
    const value = draft.trim();
    if (!value && pendingFiles.length === 0) return;
    startTransition(async () => {
      const refs = await uploadFiles(projectId, pendingFiles, (msg) => addToast(msg, "error"));
      const res = await addProjectNote(projectId, value, refs);
      if ("error" in res) addToast(res.error, "error");
      else {
        setDraft("");
        setPendingFiles([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
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
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (files.length > 0) {
              e.preventDefault();
              addFiles(files);
            }
          }}
          rows={3}
          placeholder="Neue Notiz … (⌘/Ctrl+Enter speichert · @name benachrichtigt · Dateien hier reinziehen)"
          className="block w-full resize-y rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
        />

        {pendingFiles.length > 0 && (
          <ul className="mt-2 space-y-1">
            {pendingFiles.map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-2 rounded-md bg-gray-50 px-2 py-1 text-xs dark:bg-[#1c1c1e]">
                <span className="flex items-center gap-1.5 truncate">
                  {isImageMime(f.type) ? <ImageIcon className="h-3.5 w-3.5 text-gray-400" /> : <FileText className="h-3.5 w-3.5 text-gray-400" />}
                  <span className="truncate">{f.name}</span>
                  <span className="text-gray-400">· {formatBytes(f.size)}</span>
                </span>
                <button onClick={() => removePendingFile(i)} className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-white/10">
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-2 flex items-center justify-between">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 dark:border-[#2c2c2e]/60 dark:text-gray-300 dark:hover:bg-white/5">
            <Paperclip className="h-3 w-3" /> Datei
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={NOTE_ATTACHMENT_ACCEPT}
              onChange={(e) => addFiles(e.target.files)}
              className="hidden"
            />
          </label>
          <button
            type="button"
            onClick={add}
            disabled={(!draft.trim() && pendingFiles.length === 0) || pending}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-primary-dark disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" /> {pending ? "Speichern…" : "Notiz speichern"}
          </button>
        </div>
      </div>

      {notes.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400 dark:border-[#2c2c2e]/60">
          Noch keine Notizen. Halte hier Status-Updates, Absprachen oder Reminder fest. Erwähne Kollegen mit @name.
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
    if (!value && (note.attachments?.length ?? 0) === 0) {
      addToast("Notiz darf nicht leer sein.", "error");
      return;
    }
    startTransition(async () => {
      const res = await updateProjectNote(note.id, projectId, value, [], []);
      if ("error" in res) addToast(res.error, "error");
      else {
        setEditing(false);
        router.refresh();
      }
    });
  }

  function del() {
    if (!confirm("Notiz wirklich löschen? Anhänge werden mit gelöscht.")) return;
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
            <button onClick={() => setEditing(true)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5" title="Bearbeiten">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={del} disabled={pending} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-900/20" title="Löschen">
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
            <button type="button" onClick={() => { setEditing(false); setDraft(note.content); }} disabled={pending} className="inline-flex items-center gap-1 rounded-md px-3 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5">
              <X className="h-3 w-3" /> Abbrechen
            </button>
            <button type="button" onClick={save} disabled={pending} className="rounded-md bg-gray-900 px-3 py-1 text-xs text-white disabled:opacity-50 dark:bg-white dark:text-gray-900">
              {pending ? "Speichern…" : "Speichern"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">{renderWithMentions(note.content)}</p>
          {note.attachments && note.attachments.length > 0 && (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {note.attachments.map((a) => <AttachmentItem key={a.id} a={a} />)}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function renderWithMentions(content: string): React.ReactNode {
  // Splittet an @handle und rendert die Mention als Pille.
  const parts = content.split(/(@[a-z0-9._-]+)/gi);
  return parts.map((p, i) => {
    if (/^@[a-z0-9._-]+$/i.test(p)) {
      return (
        <span key={i} className="rounded bg-primary/10 px-1 text-primary">{p}</span>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

function AttachmentItem({ a }: { a: LoadedProjectNoteAttachment }) {
  if (!a.signed_url) {
    return (
      <li className="flex items-center gap-2 rounded-md border border-dashed border-gray-200 px-2 py-1.5 text-xs text-gray-400 dark:border-[#2c2c2e]/60">
        <FileText className="h-3.5 w-3.5" /> {a.file_name} (nicht verfügbar)
      </li>
    );
  }
  if (isImageMime(a.mime_type)) {
    return (
      <li>
        <a href={a.signed_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-gray-200 dark:border-[#2c2c2e]/60">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.signed_url} alt={a.file_name} className="h-32 w-full object-cover" loading="lazy" />
          <span className="block truncate px-2 py-1 text-[11px] text-gray-500 dark:text-gray-400">{a.file_name} · {formatBytes(a.size_bytes)}</span>
        </a>
      </li>
    );
  }
  return (
    <li>
      <a href={a.signed_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-[#2c2c2e]/60 dark:text-gray-200 dark:hover:bg-white/5">
        <FileText className="h-3.5 w-3.5 text-gray-400" />
        <span className="truncate">{a.file_name}</span>
        <span className="ml-auto text-[11px] text-gray-400">{formatBytes(a.size_bytes)}</span>
      </a>
    </li>
  );
}
