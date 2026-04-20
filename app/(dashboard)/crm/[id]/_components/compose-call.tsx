"use client";

import { useState, useTransition } from "react";
import { PhoneCall, PhoneOutgoing, X } from "lucide-react";
import type { LeadContact, CallDirection, CallStatus } from "@/lib/types";
import { logCall, startCall, type CallProvider } from "../../actions";
import { useToastContext } from "../../../toast-provider";

export function ComposeCall({
  leadId, leadPhone, contacts, callProviders, onClose, onSaved,
}: {
  leadId: string; leadPhone: string | null; contacts: LeadContact[];
  callProviders: { phonemondo: boolean; webex: boolean };
  onClose: () => void; onSaved: () => void;
}) {
  const [mode, setMode] = useState<"live" | "log">("live");
  const [contactId, setContactId] = useState("");
  const [phone, setPhone] = useState(leadPhone ?? "");
  const [direction, setDirection] = useState<CallDirection>("outbound");
  const [status, setStatus] = useState<CallStatus>("answered");
  const [duration, setDuration] = useState(0);
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { addToast } = useToastContext();

  const bothProviders = callProviders.phonemondo && callProviders.webex;
  const defaultProvider: CallProvider = callProviders.phonemondo ? "phonemondo" : "webex";
  const [provider, setProvider] = useState<CallProvider>(defaultProvider);

  const callable = [
    ...(leadPhone ? [{ label: "Firmennummer", phone: leadPhone, contactId: null as string | null }] : []),
    ...contacts.filter((c) => c.phone).map((c) => ({
      label: c.name + (c.role ? ` (${c.role})` : ""),
      phone: c.phone!,
      contactId: c.id,
    })),
  ];

  function live(p: string, cId: string | null) {
    setError(null);
    startTransition(async () => {
      const res = await startCall({ leadId, phoneNumber: p, contactId: cId, provider });
      if (res.error) {
        setError(res.error);
        addToast(res.error, "error");
      } else {
        addToast(`Anruf via ${provider === "webex" ? "Webex" : "PhoneMondo"} gestartet`, "success");
        onSaved();
      }
    });
  }

  function logSubmit() {
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
      if (res.error) {
        setError(res.error);
        addToast(res.error, "error");
      } else {
        addToast("Anruf protokolliert", "success");
        onSaved();
      }
    });
  }

  return (
    <div className="border-b border-gray-100 bg-emerald-50/30 p-4 dark:border-[#2c2c2e] dark:bg-emerald-900/5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <PhoneCall className="h-3.5 w-3.5" />
            Anruf
          </p>
          <div className="flex rounded-md border border-gray-200 p-0.5 dark:border-[#2c2c2e]">
            <button
              onClick={() => setMode("live")}
              className={`rounded px-2 py-0.5 text-xs ${
                mode === "live" ? "bg-gray-200 font-medium dark:bg-white/10" : "text-gray-500"
              }`}
            >
              Jetzt anrufen
            </button>
            <button
              onClick={() => setMode("log")}
              className={`rounded px-2 py-0.5 text-xs ${
                mode === "log" ? "bg-gray-200 font-medium dark:bg-white/10" : "text-gray-500"
              }`}
            >
              Manuell protokollieren
            </button>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
      </div>

      {mode === "live" ? (
        <div className="mt-3 space-y-2">
          {bothProviders && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500 dark:text-gray-400">Provider:</span>
              <div className="flex rounded-md border border-gray-200 p-0.5 dark:border-[#2c2c2e]">
                <button
                  type="button"
                  onClick={() => setProvider("phonemondo")}
                  className={`rounded px-2 py-0.5 text-xs ${
                    provider === "phonemondo" ? "bg-gray-200 font-medium dark:bg-white/10" : "text-gray-500"
                  }`}
                >
                  PhoneMondo
                </button>
                <button
                  type="button"
                  onClick={() => setProvider("webex")}
                  className={`rounded px-2 py-0.5 text-xs ${
                    provider === "webex" ? "bg-gray-200 font-medium dark:bg-white/10" : "text-gray-500"
                  }`}
                >
                  Webex
                </button>
              </div>
            </div>
          )}
          {!callProviders.phonemondo && !callProviders.webex && (
            <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              Keine Telefonie-Integration konfiguriert. In den Einstellungen (PhoneMondo oder Webex) einrichten.
            </p>
          )}
          {callable.length === 0 ? (
            <p className="text-sm text-gray-400">Keine Telefonnummer vorhanden.</p>
          ) : (
            callable.map((c, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]"
              >
                <div>
                  <p className="text-sm font-medium">{c.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{c.phone}</p>
                </div>
                <button
                  onClick={() => live(c.phone, c.contactId)}
                  disabled={pending}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <PhoneOutgoing className="h-3 w-3" />
                  Anrufen
                </button>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select value={direction} onChange={(e) => setDirection(e.target.value as CallDirection)} className="rounded-md border border-gray-200 bg-white p-1.5 text-xs dark:border-[#2c2c2e] dark:bg-[#161618]">
              <option value="outbound">Ausgehend</option>
              <option value="inbound">Eingehend</option>
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value as CallStatus)} className="rounded-md border border-gray-200 bg-white p-1.5 text-xs dark:border-[#2c2c2e] dark:bg-[#161618]">
              <option value="answered">Angenommen</option>
              <option value="ended">Beendet</option>
              <option value="missed">Nicht erreicht</option>
              <option value="failed">Fehlgeschlagen</option>
            </select>
            <input type="number" min={0} placeholder="Dauer (s)" value={duration || ""} onChange={(e) => setDuration(parseInt(e.target.value, 10) || 0)} className="rounded-md border border-gray-200 bg-white p-1.5 text-xs dark:border-[#2c2c2e] dark:bg-[#161618]" />
            <input placeholder="Nummer" value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded-md border border-gray-200 bg-white p-1.5 text-xs dark:border-[#2c2c2e] dark:bg-[#161618]" />
          </div>
          <select value={contactId} onChange={(e) => setContactId(e.target.value)} className="w-full rounded-md border border-gray-200 bg-white p-1.5 text-xs dark:border-[#2c2c2e] dark:bg-[#161618]">
            <option value="">Kontakt (optional)</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.role ? ` (${c.role})` : ""}</option>
            ))}
          </select>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Gesprächsnotiz" className="w-full resize-none rounded-md border border-gray-200 bg-white p-1.5 text-xs dark:border-[#2c2c2e] dark:bg-[#161618]" />
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-md px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5">Abbrechen</button>
            <button onClick={logSubmit} disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50">
              {pending ? "Speichern…" : "Protokoll speichern"}
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
