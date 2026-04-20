"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  PhoneIncoming, PhoneOutgoing, PhoneMissed, Play, ArrowRight,
  Trash2, Pencil, Save, FileText, ChevronDown, ChevronUp, AlertCircle,
} from "lucide-react";
import type { CustomLeadStatus, LeadEnrichment, LeadChange } from "@/lib/types";
import { CrmStatusBadge } from "../../status-badge";
import { deleteNote, updateNote } from "../../actions";
import { useToastContext } from "../../../toast-provider";
import type { NoteRow, CallRow, AuditRow } from "./types";
import { formatDur } from "./activity-helpers";

export function NoteItem({ note, leadId }: { note: NoteRow; leadId: string }) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(note.content);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    if (!content.trim()) return;
    startTransition(async () => {
      const res = await updateNote(note.id, leadId, content);
      if (res.error) {
        addToast(res.error, "error");
      } else {
        addToast("Notiz aktualisiert", "success");
        setEditing(false);
        router.refresh();
      }
    });
  }

  function handleDelete() {
    if (!confirm("Notiz wirklich löschen?")) return;
    startTransition(async () => {
      const res = await deleteNote(note.id, leadId);
      if (res.error) addToast(res.error, "error");
      else {
        addToast("Notiz gelöscht", "success");
        router.refresh();
      }
    });
  }

  if (editing) {
    return (
      <div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          autoFocus
          className="w-full resize-none rounded-md border border-amber-200 bg-amber-50/30 p-2 text-sm dark:border-amber-900/40 dark:bg-amber-900/5"
        />
        <div className="mt-1.5 flex justify-end gap-1">
          <button
            onClick={() => { setEditing(false); setContent(note.content); }}
            className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={pending || !content.trim() || content === note.content}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-gray-900 hover:bg-primary-dark disabled:opacity-50"
          >
            <Save className="h-3 w-3" />
            {pending ? "Speichern…" : "Speichern"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative">
      <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{note.content}</p>
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

export function EnrichmentItem({ enrichment }: { enrichment: LeadEnrichment }) {
  if (enrichment.status === "completed" && !enrichment.error_message) return null;
  return <p className="text-xs text-red-600">{enrichment.error_message}</p>;
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
