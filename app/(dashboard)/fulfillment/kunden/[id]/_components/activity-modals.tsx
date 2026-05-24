"use client";

import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
import {
  addManualCall,
  updateManualCall,
  addManualNote,
  updateManualNote,
} from "../../../mail-actions";
import { useToastContext } from "../../../../toast-provider";

function toLocalInputs(iso: string | null | undefined): { date: string; time: string } {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function combineDateTime(date: string, time: string): string | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d, hh ?? 0, mm ?? 0, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

const inputCls =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e] dark:text-gray-100";

export function CallEntryModal({
  leadId,
  existing,
  onClose,
  onSaved,
}: {
  leadId: string;
  existing?: {
    id: string;
    direction: "inbound" | "outbound";
    notes: string | null;
    durationSeconds: number | null;
    occurredAt: string;
  } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();
  const initial = toLocalInputs(existing?.occurredAt ?? null);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [direction, setDirection] = useState<"inbound" | "outbound">(existing?.direction ?? "outbound");
  const [durationMin, setDurationMin] = useState<string>(
    existing?.durationSeconds != null ? Math.round(existing.durationSeconds / 60).toString() : "",
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const occurredAt = combineDateTime(date, time);
    if (!occurredAt) {
      addToast("Datum/Uhrzeit ungültig.", "error");
      return;
    }
    const dur = durationMin.trim() ? Number(durationMin) : null;
    if (dur != null && (Number.isNaN(dur) || dur < 0)) {
      addToast("Dauer ungültig.", "error");
      return;
    }
    startTransition(async () => {
      const res = existing
        ? await updateManualCall({
            callId: existing.id,
            leadId,
            occurredAt,
            durationMinutes: dur,
            direction,
            notes: notes.trim() || null,
          })
        : await addManualCall({
            leadId,
            occurredAt,
            durationMinutes: dur,
            direction,
            notes: notes.trim() || null,
          });
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      addToast(existing ? "Anruf aktualisiert." : "Anruf protokolliert.", "success");
      onSaved();
      onClose();
    });
  }

  return (
    <ModalShell title={existing ? "Anruf bearbeiten" : "Anruf protokollieren"} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Datum">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} required />
          </Field>
          <Field label="Uhrzeit">
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} required />
          </Field>
          <Field label="Richtung">
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as "inbound" | "outbound")}
              className={inputCls}
            >
              <option value="outbound">Ausgehend</option>
              <option value="inbound">Eingehend</option>
            </select>
          </Field>
          <Field label="Dauer (Minuten)">
            <input
              type="number"
              min={0}
              step={1}
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
              className={inputCls}
              placeholder="optional"
            />
          </Field>
          <Field label="Notiz" full>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputCls}
              placeholder="Worum ging es?"
            />
          </Field>
        </div>
        <ModalFooter onClose={onClose} pending={pending} submitLabel={existing ? "Speichern" : "Anlegen"} />
      </form>
    </ModalShell>
  );
}

export function NoteEntryModal({
  leadId,
  existing,
  onClose,
  onSaved,
}: {
  leadId: string;
  existing?: { id: string; content: string; occurredAt: string } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();
  const initial = toLocalInputs(existing?.occurredAt ?? null);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [content, setContent] = useState(existing?.content ?? "");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) {
      addToast("Inhalt fehlt.", "error");
      return;
    }
    const occurredAt = combineDateTime(date, time);
    if (!occurredAt) {
      addToast("Datum/Uhrzeit ungültig.", "error");
      return;
    }
    startTransition(async () => {
      const res = existing
        ? await updateManualNote({ noteId: existing.id, leadId, content, occurredAt })
        : await addManualNote({ leadId, content, occurredAt });
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      addToast(existing ? "Notiz aktualisiert." : "Notiz angelegt.", "success");
      onSaved();
      onClose();
    });
  }

  return (
    <ModalShell title={existing ? "Notiz bearbeiten" : "Neue Notiz"} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Datum">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} required />
          </Field>
          <Field label="Uhrzeit">
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} required />
          </Field>
          <Field label="Inhalt" full>
            <textarea
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className={inputCls}
              placeholder="Worum geht es?"
              required
            />
          </Field>
        </div>
        <ModalFooter onClose={onClose} pending={pending} submitLabel={existing ? "Speichern" : "Anlegen"} />
      </form>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-[#2c2c2e]/60 dark:bg-[#161618]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5"
            aria-label="Schliessen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalFooter({
  onClose,
  pending,
  submitLabel,
}: {
  onClose: () => void;
  pending: boolean;
  submitLabel: string;
}) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-[#2c2c2e]/60 dark:hover:bg-white/5"
      >
        Abbrechen
      </button>
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-primary px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-primary-dark disabled:opacity-50"
      >
        {pending ? "Speichern…" : submitLabel}
      </button>
    </div>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="block text-xs font-medium uppercase tracking-wider text-gray-400">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
