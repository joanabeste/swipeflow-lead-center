"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PhoneOutgoing, Plus, StickyNote, Phone as PhoneIcon } from "lucide-react";
import type { LeadContact, CallDirection, CallStatus } from "@/lib/types";
import { addNote, logCall, startCall } from "../actions";

export function CrmSidePanel({
  leadId,
  leadPhone,
  contacts,
}: {
  leadId: string;
  leadPhone: string | null;
  contacts: LeadContact[];
}) {
  const router = useRouter();
  const [noteContent, setNoteContent] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [notePending, startNote] = useTransition();

  const [callError, setCallError] = useState<string | null>(null);
  const [callPending, startCallTransition] = useTransition();

  const [manualOpen, setManualOpen] = useState(false);

  const callable = [
    ...(leadPhone ? [{ label: "Firmennummer", phone: leadPhone, contactId: null as string | null }] : []),
    ...contacts.filter((c) => c.phone).map((c) => ({
      label: c.name + (c.role ? ` (${c.role})` : ""),
      phone: c.phone!,
      contactId: c.id,
    })),
  ];

  function handleStartCall(phone: string, contactId: string | null) {
    setCallError(null);
    startCallTransition(async () => {
      const res = await startCall({ leadId, phoneNumber: phone, contactId });
      if (res.error) setCallError(res.error);
      else router.refresh();
    });
  }

  function handleAddNote() {
    if (!noteContent.trim()) return;
    setNoteError(null);
    startNote(async () => {
      const res = await addNote(leadId, noteContent);
      if (res.error) setNoteError(res.error);
      else {
        setNoteContent("");
        router.refresh();
      }
    });
  }

  return (
    <>
      {/* Anrufen */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400">
          <PhoneIcon className="h-3.5 w-3.5" />
          Anrufen
        </h2>
        {callable.length === 0 ? (
          <p className="mt-2 text-sm text-gray-400">Keine Telefonnummer hinterlegt.</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {callable.map((c, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-2 rounded-md border border-gray-100 px-3 py-2 dark:border-[#2c2c2e]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.label}</p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">{c.phone}</p>
                </div>
                <button
                  onClick={() => handleStartCall(c.phone, c.contactId)}
                  disabled={callPending}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <PhoneOutgoing className="h-3 w-3" />
                  Call
                </button>
              </li>
            ))}
          </ul>
        )}
        {callError && <p className="mt-2 text-xs text-red-600">{callError}</p>}
        <button
          onClick={() => setManualOpen((v) => !v)}
          className="mt-2 text-xs text-gray-500 hover:underline dark:text-gray-400"
        >
          {manualOpen ? "Manuelles Protokoll schließen" : "Anruf manuell protokollieren"}
        </button>
        {manualOpen && <ManualCallForm leadId={leadId} contacts={contacts} defaultPhone={leadPhone} />}
      </div>

      {/* Notiz */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400">
          <StickyNote className="h-3.5 w-3.5" />
          Schnelle Notiz
        </h2>
        <textarea
          value={noteContent}
          onChange={(e) => setNoteContent(e.target.value)}
          rows={3}
          placeholder="Was ist passiert? Follow-Up?"
          className="mt-2 w-full resize-none rounded-md border border-gray-200 bg-white p-2 text-sm dark:border-[#2c2c2e] dark:bg-[#161618]"
        />
        {noteError && <p className="mt-1 text-xs text-red-600">{noteError}</p>}
        <div className="mt-2 flex justify-end">
          <button
            onClick={handleAddNote}
            disabled={notePending || !noteContent.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            {notePending ? "Speichern…" : "Notiz"}
          </button>
        </div>
      </div>
    </>
  );
}

function ManualCallForm({
  leadId, contacts, defaultPhone,
}: {
  leadId: string;
  contacts: LeadContact[];
  defaultPhone: string | null;
}) {
  const router = useRouter();
  const [direction, setDirection] = useState<CallDirection>("outbound");
  const [status, setStatus] = useState<CallStatus>("answered");
  const [duration, setDuration] = useState(0);
  const [notes, setNotes] = useState("");
  const [contactId, setContactId] = useState("");
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await logCall({
        leadId,
        contactId: contactId || null,
        direction,
        status,
        durationSeconds: duration > 0 ? duration : null,
        notes: notes.trim() || null,
        phoneNumber: phone || null,
      });
      if (res.error) setError(res.error);
      else {
        setNotes("");
        setDuration(0);
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-3 space-y-2 rounded-md border border-gray-100 p-3 text-xs dark:border-[#2c2c2e]">
      <div className="grid grid-cols-2 gap-2">
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as CallDirection)}
          className="rounded-md border border-gray-200 bg-white p-1.5 dark:border-[#2c2c2e] dark:bg-[#161618]"
        >
          <option value="outbound">Ausgehend</option>
          <option value="inbound">Eingehend</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as CallStatus)}
          className="rounded-md border border-gray-200 bg-white p-1.5 dark:border-[#2c2c2e] dark:bg-[#161618]"
        >
          <option value="answered">Angenommen</option>
          <option value="ended">Beendet</option>
          <option value="missed">Nicht erreicht</option>
          <option value="failed">Fehlgeschlagen</option>
        </select>
        <input
          type="number"
          min={0}
          placeholder="Dauer (s)"
          value={duration || ""}
          onChange={(e) => setDuration(parseInt(e.target.value, 10) || 0)}
          className="rounded-md border border-gray-200 bg-white p-1.5 dark:border-[#2c2c2e] dark:bg-[#161618]"
        />
        <input
          placeholder="Nummer"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="rounded-md border border-gray-200 bg-white p-1.5 dark:border-[#2c2c2e] dark:bg-[#161618]"
        />
      </div>
      <select
        value={contactId}
        onChange={(e) => setContactId(e.target.value)}
        className="w-full rounded-md border border-gray-200 bg-white p-1.5 dark:border-[#2c2c2e] dark:bg-[#161618]"
      >
        <option value="">Kontakt (optional)</option>
        {contacts.map((c) => (
          <option key={c.id} value={c.id}>{c.name}{c.role ? ` (${c.role})` : ""}</option>
        ))}
      </select>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="Gesprächsnotiz"
        className="w-full resize-none rounded-md border border-gray-200 bg-white p-1.5 dark:border-[#2c2c2e] dark:bg-[#161618]"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end">
        <button
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
        >
          <Plus className="h-3 w-3" />
          {pending ? "Speichern…" : "Speichern"}
        </button>
      </div>
    </div>
  );
}
