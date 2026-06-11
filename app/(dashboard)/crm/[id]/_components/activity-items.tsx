"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePreviewRefresh } from "@/lib/preview-refresh-context";
import {
  PhoneIncoming, PhoneOutgoing, PhoneMissed, Play, ArrowRight,
  Trash2, Pencil, Save, FileText, ChevronDown, ChevronUp, AlertCircle, Mail, Paperclip, X,
  Undo2, Loader2,
} from "lucide-react";
import type { CustomLeadStatus, LeadEnrichment, LeadChange, LoadedNoteAttachment } from "@/lib/types";
import type { LeadImportInfo } from "./types";
import { importSourceLabel } from "./activity-helpers";
import {
  NOTE_ATTACHMENT_ACCEPT,
  NOTE_ATTACHMENT_ALLOWED_MIMES,
  NOTE_ATTACHMENT_MAX_BYTES,
  formatBytes,
  isImageMime,
  type UploadedAttachmentRef,
} from "@/lib/notes/format";
import { uploadFileToTicket } from "@/lib/notes/client-upload";
import { CrmStatusBadge } from "../../status-badge";
import { createNoteAttachmentUploads, deleteNote, updateNote } from "../../actions";
import { unmergeDuplicate } from "../../../leads/actions";
import { useToastContext } from "../../../toast-provider";
import type { NoteRow, CallRow, AuditRow, EmailRow } from "./types";
import { formatDur } from "./activity-helpers";

interface PendingFile {
  id: string;
  file: File;
  previewUrl: string | null;
}

/** Ältester Historien-Eintrag: wie der Lead reinkam (Import-Typ/Quelle). */
export function ImportItem({ info }: { info: LeadImportInfo }) {
  const detail = info.sourceUrl || info.fileName;
  return (
    <div>
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
        {importSourceLabel(info.importType, info.sourceType)}
      </span>
      {detail && (
        <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400" title={detail}>
          {detail}
        </p>
      )}
    </div>
  );
}

export function NoteItem({ note, leadId }: { note: NoteRow; leadId: string }) {
  const notify = usePreviewRefresh();
  const { addToast } = useToastContext();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(note.content);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live-Vorschau-URLs revoken, wenn der Edit-Modus verlassen / die Komponente unmounted wird.
  useEffect(() => {
    return () => {
      for (const f of pendingFiles) if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetEdit() {
    for (const f of pendingFiles) if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    setPendingFiles([]);
    setRemovedIds(new Set());
    setContent(note.content);
    setEditing(false);
  }

  function addFiles(files: FileList | File[]) {
    const list = Array.from(files);
    const accepted: PendingFile[] = [];
    for (const file of list) {
      if (!NOTE_ATTACHMENT_ALLOWED_MIMES.has(file.type)) {
        addToast(`Dateityp nicht erlaubt: ${file.name}`, "error");
        continue;
      }
      if (file.size > NOTE_ATTACHMENT_MAX_BYTES) {
        addToast(`${file.name} zu groß`, "error");
        continue;
      }
      accepted.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: isImageMime(file.type) ? URL.createObjectURL(file) : null,
      });
    }
    if (accepted.length > 0) setPendingFiles((prev) => [...prev, ...accepted]);
  }

  function removePending(id: string) {
    setPendingFiles((prev) => {
      const t = prev.find((p) => p.id === id);
      if (t?.previewUrl) URL.revokeObjectURL(t.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  const visibleExisting = note.attachments.filter((a) => !removedIds.has(a.id));
  const noteWillBeEmpty =
    !content.trim() && visibleExisting.length === 0 && pendingFiles.length === 0;
  const dirty =
    content !== note.content ||
    pendingFiles.length > 0 ||
    removedIds.size > 0;

  function handleSave() {
    if (noteWillBeEmpty || !dirty) return;
    startTransition(async () => {
      const refs: UploadedAttachmentRef[] = [];
      if (pendingFiles.length > 0) {
        const ticketRes = await createNoteAttachmentUploads(
          leadId,
          pendingFiles.map((p) => ({
            clientId: p.id,
            fileName: p.file.name,
            mimeType: p.file.type,
            sizeBytes: p.file.size,
          })),
        );
        if ("error" in ticketRes) {
          addToast(ticketRes.error, "error");
          return;
        }
        if (ticketRes.errors.length > 0) {
          for (const e of ticketRes.errors) addToast(e.error, "error");
        }
        for (const ticket of ticketRes.tickets) {
          const pending = pendingFiles.find((p) => p.id === ticket.clientId);
          if (!pending) continue;
          const up = await uploadFileToTicket(ticket, pending.file);
          if ("error" in up) {
            addToast(`Upload ${pending.file.name}: ${up.error}`, "error");
            continue;
          }
          refs.push(up.ref);
        }
      }
      const res = await updateNote(
        note.id,
        leadId,
        content,
        refs,
        Array.from(removedIds),
      );
      if (res.error) {
        addToast(res.error, "error");
        return;
      }
      if (res.warning) addToast(res.warning, "error");
      else addToast("Notiz aktualisiert", "success");
      resetEdit();
      notify();
    });
  }

  function handleDelete() {
    if (!confirm("Notiz wirklich löschen?")) return;
    startTransition(async () => {
      const res = await deleteNote(note.id, leadId);
      if (res.error) addToast(res.error, "error");
      else {
        addToast("Notiz gelöscht", "success");
        notify();
      }
    });
  }

  // „Duplikat wieder trennen": macht den Merge rückgängig. `leadId` ist der Survivor,
  // `note.merged_from_lead_id` der archivierte Verlierer. Nur an der echten Merge-Notiz sichtbar.
  function handleUnmerge() {
    if (!note.merged_from_lead_id) return;
    if (
      !confirm(
        "Dieses zusammengeführte Duplikat wieder trennen?\n\nDer Ursprungs-Lead wird reaktiviert; " +
          "übernommene Aktivitäten und befüllte Stammdaten werden — soweit nachvollziehbar — zurückübertragen.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await unmergeDuplicate(leadId, note.merged_from_lead_id!);
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      addToast(res.info ?? "Duplikat wieder getrennt", "success");
      notify();
    });
  }

  if (editing) {
    return (
      <div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onPaste={(e) => {
            const files = e.clipboardData?.files;
            if (files && files.length > 0) {
              e.preventDefault();
              void addFiles(files);
            }
          }}
          rows={3}
          autoFocus
          className="w-full resize-none rounded-md border border-amber-200 bg-amber-50/30 p-2 text-sm dark:border-amber-900/40 dark:bg-amber-900/5"
        />

        {(visibleExisting.length > 0 || pendingFiles.length > 0) && (
          <ul className="mt-2 flex flex-wrap gap-2">
            {visibleExisting.map((a) => (
              <EditableExistingChip
                key={a.id}
                attachment={a}
                onRemove={() => setRemovedIds((prev) => new Set(prev).add(a.id))}
              />
            ))}
            {pendingFiles.map((p) => (
              <EditablePendingChip key={p.id} pending={p} onRemove={() => removePending(p.id)} />
            ))}
          </ul>
        )}

        <div className="mt-1.5 flex items-center justify-between gap-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50 dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-300 dark:hover:bg-white/5"
          >
            <Paperclip className="h-3 w-3" />
            Datei anhängen
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={resetEdit}
              className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSave}
              disabled={pending || !dirty || noteWillBeEmpty}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-gray-900 hover:bg-primary-dark disabled:opacity-50"
            >
              <Save className="h-3 w-3" />
              {pending ? "Speichern…" : "Speichern"}
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={NOTE_ATTACHMENT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    );
  }

  return (
    <div className="group relative">
      {note.merged_from_company && (
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          {note.merged_from_lead_id ? (
            <Link
              href={`/crm/${note.merged_from_lead_id}`}
              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 hover:bg-amber-200 hover:underline dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60"
              title="Ursprungs-Lead ansehen"
            >
              ↪ übernommen von {note.merged_from_company}
            </Link>
          ) : (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
              title="Diese Notiz stammt aus einem zusammengeführten Duplikat"
            >
              ↪ übernommen von {note.merged_from_company}
            </span>
          )}
          {/* „Trennen" nur an der echten Merge-Notiz (🔀) — nicht an übernommenen Kind-Notizen. */}
          {note.merged_from_lead_id && note.content?.startsWith("🔀") && (
            <button
              onClick={handleUnmerge}
              disabled={pending}
              title="Duplikat wieder trennen — Ursprungs-Lead reaktivieren"
              className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[10px] font-medium text-amber-700 transition hover:bg-amber-50 disabled:opacity-50 dark:border-amber-900/50 dark:bg-[#232325] dark:text-amber-300 dark:hover:bg-amber-900/20"
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
              Trennen
            </button>
          )}
        </div>
      )}
      {note.content && (
        <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
          {note.content}
        </p>
      )}
      {note.attachments.length > 0 && (
        <AttachmentGrid attachments={note.attachments} />
      )}
      {note.updated_at && note.updated_at !== note.created_at && (
        <p className="mt-0.5 text-[10px] text-gray-400">
          bearbeitet {new Date(note.updated_at).toLocaleString("de-DE")}
        </p>
      )}
      <div className="mt-2 flex items-center gap-1">
        <button
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-600 transition hover:border-primary hover:bg-primary/10 hover:text-primary dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-300 dark:hover:bg-primary/20"
          title="Notiz bearbeiten"
        >
          <Pencil className="h-3 w-3" />
          Bearbeiten
        </button>
        <button
          onClick={handleDelete}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-300 dark:hover:border-red-800 dark:hover:bg-red-900/20 dark:hover:text-red-400"
          title="Notiz löschen"
        >
          <Trash2 className="h-3 w-3" />
          Löschen
        </button>
      </div>
    </div>
  );
}

function AttachmentGrid({ attachments }: { attachments: LoadedNoteAttachment[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((a) => {
        const isImage = isImageMime(a.mime_type);
        if (isImage && a.signed_url) {
          return (
            <a
              key={a.id}
              href={a.signed_url}
              target="_blank"
              rel="noreferrer"
              title={a.file_name}
              className="relative block h-20 w-20 overflow-hidden rounded-md border border-gray-200 hover:border-primary dark:border-[#2c2c2e]"
            >
              <Image
                src={a.signed_url}
                alt={a.file_name}
                fill
                sizes="80px"
                className="object-cover"
                unoptimized
              />
            </a>
          );
        }
        return (
          <a
            key={a.id}
            href={a.signed_url ?? "#"}
            target="_blank"
            rel="noreferrer"
            download={a.file_name}
            title={a.file_name}
            className="inline-flex max-w-[220px] items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 hover:border-primary hover:bg-primary/5 dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-300"
          >
            <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span className="truncate">{a.file_name}</span>
            <span className="shrink-0 text-gray-400">· {formatBytes(a.size_bytes)}</span>
          </a>
        );
      })}
    </div>
  );
}

function EditableExistingChip({
  attachment, onRemove,
}: { attachment: LoadedNoteAttachment; onRemove: () => void }) {
  const isImage = isImageMime(attachment.mime_type);
  return (
    <li className="group/chip relative">
      {isImage && attachment.signed_url ? (
        <div className="relative h-16 w-16 overflow-hidden rounded-md border border-gray-200 dark:border-[#2c2c2e]">
          <Image
            src={attachment.signed_url}
            alt={attachment.file_name}
            fill
            sizes="64px"
            className="object-cover"
            unoptimized
          />
        </div>
      ) : (
        <div className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-300">
          <FileText className="h-3.5 w-3.5 text-gray-400" />
          <span className="max-w-[180px] truncate" title={attachment.file_name}>
            {attachment.file_name}
          </span>
          <span className="text-gray-400">· {formatBytes(attachment.size_bytes)}</span>
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        title="Anhang entfernen"
        className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-red-600 text-white shadow-md group-hover/chip:flex hover:bg-red-700"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </li>
  );
}

function EditablePendingChip({
  pending, onRemove,
}: { pending: PendingFile; onRemove: () => void }) {
  const isImage = isImageMime(pending.file.type);
  return (
    <li className="group/chip relative">
      {isImage && pending.previewUrl ? (
        <div className="relative h-16 w-16 overflow-hidden rounded-md border-2 border-amber-300 dark:border-amber-700">
          <Image
            src={pending.previewUrl}
            alt={pending.file.name}
            fill
            sizes="64px"
            className="object-cover"
            unoptimized
          />
        </div>
      ) : (
        <div className="flex items-center gap-1.5 rounded-md border-2 border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
          <FileText className="h-3.5 w-3.5" />
          <span className="max-w-[160px] truncate" title={pending.file.name}>
            {pending.file.name}
          </span>
          <span>· {formatBytes(pending.file.size)}</span>
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        title="Entfernen"
        className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-gray-700 text-white shadow-md group-hover/chip:flex hover:bg-gray-900"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </li>
  );
}

export function CallItem({ call }: { call: CallRow }) {
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const directionIcon =
    call.status === "missed" ? <PhoneMissed className="h-3 w-3 text-red-500" />
      : call.direction === "inbound" ? <PhoneIncoming className="h-3 w-3 text-blue-500" />
      : <PhoneOutgoing className="h-3 w-3 text-emerald-500" />;
  const statusLabel: Record<string, string> = {
    initiated: "initiiert", ringing: "klingelt", answered: "angenommen",
    missed: "nicht erreicht", failed: "fehlgeschlagen", ended: "beendet",
  };
  const hasEnded = !!call.ended_at;
  const hasRecording = !!call.recording_url;
  const hasTranscript = !!call.transcript_text;
  const aiDisabled = call.transcript_fetch_error?.toLowerCase().includes("ai assistant");
  const providerLabel =
    call.call_provider === "webex" ? "Webex"
      : call.call_provider === "phonemondo" ? "PhoneMondo"
      : null;

  return (
    <div className="text-sm">
      <p className="inline-flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
        {directionIcon}
        {call.direction === "inbound" ? "Eingehend" : "Ausgehend"}
        <span className="text-gray-500 dark:text-gray-400">· {statusLabel[call.status] ?? call.status}</span>
        {call.duration_seconds != null && (
          <span className="text-xs text-gray-500 dark:text-gray-400">· {formatDur(call.duration_seconds)}</span>
        )}
        {call.phone_number && (
          <span className="text-xs text-gray-500 dark:text-gray-400">· {call.phone_number}</span>
        )}
        {providerLabel && (
          <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-white/5 dark:text-gray-400">
            {providerLabel}
          </span>
        )}
      </p>
      {call.notes && (
        <p className="mt-1 whitespace-pre-wrap text-gray-600 dark:text-gray-400">{call.notes}</p>
      )}
      {hasRecording && call.recording_url && (
        <audio controls preload="none" src={call.recording_url} className="mt-2 h-8 w-full max-w-sm">
          Dein Browser unterstützt kein HTML5-Audio.
        </audio>
      )}
      {!hasRecording && hasEnded && (
        <p className="mt-1 inline-flex items-center gap-1 text-xs text-gray-400">
          <Play className="h-3 w-3" />
          Aufzeichnung wird synchronisiert…
        </p>
      )}

      {hasTranscript && (
        <div className="mt-2">
          <button
            onClick={() => setTranscriptOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50 dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-300 dark:hover:bg-white/5"
          >
            <FileText className="h-3 w-3" />
            Transkript
            {transcriptOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {transcriptOpen && (
            <pre className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border border-gray-100 bg-gray-50 p-2.5 text-xs text-gray-700 dark:border-[#2c2c2e] dark:bg-white/5 dark:text-gray-300">
              {call.transcript_text}
            </pre>
          )}
        </div>
      )}
      {!hasTranscript && hasRecording && aiDisabled && (
        <p
          className="mt-1 inline-flex items-center gap-1 text-xs text-amber-600"
          title={call.transcript_fetch_error ?? ""}
        >
          <AlertCircle className="h-3 w-3" />
          Kein Transkript (AI Assistant inaktiv)
        </p>
      )}
      {!hasTranscript && hasRecording && !aiDisabled && call.transcript_fetch_attempted_at === null && (
        <p className="mt-1 text-xs text-gray-400">Transkript wird verarbeitet…</p>
      )}
    </div>
  );
}

export function StatusChangeItem({
  log, statuses, kind,
}: { log: AuditRow; statuses: CustomLeadStatus[]; kind: "crm" | "pipeline" }) {
  if (kind === "crm") {
    const newId = (log.details?.new_status as string | null) ?? null;
    const oldId = (log.details?.old_status as string | null) ?? null;
    return (
      <div className="inline-flex items-center gap-1.5 text-sm">
        <CrmStatusBadge statusId={oldId} statuses={statuses} fallback="—" />
        <ArrowRight className="h-3 w-3 text-gray-400" />
        <CrmStatusBadge statusId={newId} statuses={statuses} fallback="—" />
      </div>
    );
  }
  return (
    <p className="text-sm text-gray-600 dark:text-gray-400">
      Pipeline → {String(log.details?.new_status ?? "?")}
    </p>
  );
}

/** „Ins CRM verschoben" — wer den Lead aus „Neue Leads" ins CRM gepackt hat (+ Ziel-Status). */
export function MovedToCrmItem({
  log, statuses,
}: { log: AuditRow; statuses: CustomLeadStatus[] }) {
  const statusId = (log.details?.crm_status_id as string | null) ?? null;
  return (
    <div className="inline-flex items-center gap-1.5 text-sm">
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
        Ins CRM verschoben
      </span>
      {statusId && (
        <>
          <ArrowRight className="h-3 w-3 text-gray-400" />
          <CrmStatusBadge statusId={statusId} statuses={statuses} fallback="—" />
        </>
      )}
    </div>
  );
}

export function EnrichmentItem({ enrichment }: { enrichment: LeadEnrichment }) {
  if (enrichment.status === "completed" && !enrichment.error_message) return null;
  return <p className="text-xs text-red-600">{enrichment.error_message}</p>;
}

export function EmailItem({ email }: { email: EmailRow }) {
  const [bodyOpen, setBodyOpen] = useState(false);
  const failed = email.status === "failed";
  const recipient = email.contact_name
    ? `${email.contact_name} <${email.to_email}>`
    : email.to_email;
  return (
    <div className="text-sm">
      <p className="inline-flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
        <Mail className="h-3 w-3 text-blue-500" />
        <span className="font-medium">{email.subject}</span>
        {failed && (
          <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">
            <AlertCircle className="h-2.5 w-2.5" />
            Versand fehlgeschlagen
          </span>
        )}
      </p>
      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        An: {recipient}
      </p>
      {failed && email.error && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{email.error}</p>
      )}
      <div className="mt-2">
        <button
          onClick={() => setBodyOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50 dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-300 dark:hover:bg-white/5"
        >
          <FileText className="h-3 w-3" />
          Nachricht
          {bodyOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {bodyOpen && (
          <pre className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border border-gray-100 bg-gray-50 p-2.5 text-xs text-gray-700 dark:border-[#2c2c2e] dark:bg-white/5 dark:text-gray-300">
            {email.body}
          </pre>
        )}
      </div>
    </div>
  );
}

export function ChangeItem({ change }: { change: LeadChange }) {
  return (
    <p className="text-sm text-gray-600 dark:text-gray-400">
      <span className="font-medium">{change.field_name}:</span>{" "}
      <span className="line-through opacity-60">{change.old_value ?? "–"}</span>
      <ArrowRight className="mx-1 inline-block h-3 w-3" />
      {change.new_value ?? "–"}
    </p>
  );
}
