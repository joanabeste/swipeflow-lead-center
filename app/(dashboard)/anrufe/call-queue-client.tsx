"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertCircle, Briefcase, CheckCircle2, ChevronRight, Mail, Pause, Phone,
  PhoneCall, PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing, Play,
  RotateCcw, Save, SkipForward, Square,
} from "lucide-react";
import type { CallProvider } from "../crm/actions";
import {
  getCallStatus,
  queueStartCall,
  queueUpdateNotes,
  type CallStatus,
  type QueueLead,
} from "./actions";
import { useToastContext } from "../toast-provider";

const AUTO_ADVANCE_DELAY_MS = 3000; // nach missed/failed
const POLL_INTERVAL_MS = 2000;

type QueueMode = "idle" | "calling" | "paused" | "awaiting-next";

interface ActiveCall {
  callId: string;
  leadId: string;
  provider: CallProvider;
  startedAt: number;
  status: CallStatus;
}

export function CallQueueClient({
  initialQueue,
  providers,
}: {
  initialQueue: QueueLead[];
  providers: { phonemondo: boolean; webex: boolean };
}) {
  const { addToast } = useToastContext();
  const [queue, setQueue] = useState<QueueLead[]>(initialQueue);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [mode, setMode] = useState<QueueMode>("idle");
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [autoAdvanceSec, setAutoAdvanceSec] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [savedNotes, setSavedNotes] = useState("");
  const [, startTransition] = useTransition();

  const defaultProvider: CallProvider = providers.phonemondo ? "phonemondo" : "webex";
  const [provider, setProvider] = useState<CallProvider>(defaultProvider);

  const currentLead = queue[currentIndex] ?? null;
  const canNext = currentIndex < queue.length - 1;

  // Notizen werden in den Handlern zurückgesetzt, die den Index ändern
  // (setState in useEffect wäre hier ein Cascade-Render und lint-verboten).
  const resetNotes = useCallback(() => {
    setNotes("");
    setSavedNotes("");
  }, []);

  // Polling: sobald ein Call aktiv ist, alle 2s den Status prüfen.
  // Status-Reaktionen (pause bei answered, Countdown bei missed) werden
  // direkt im Polling-Callback ausgelöst — nicht in einem separaten useEffect,
  // weil React 19 synchrones setState in Effects verbietet.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!activeCall) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    const callId = activeCall.callId;
    let lastStatus: CallStatus = activeCall.status;
    pollRef.current = setInterval(async () => {
      const res = await getCallStatus(callId);
      if (!res) return;
      if (res.status === lastStatus) return;
      lastStatus = res.status;
      setActiveCall((prev) => (prev && prev.callId === callId ? { ...prev, status: res.status } : prev));
      if (res.status === "answered") {
        setMode("paused");
        setAutoAdvanceSec(null);
      } else if (res.status === "missed" || res.status === "failed" || res.status === "ended") {
        setMode("awaiting-next");
        setAutoAdvanceSec(Math.floor(AUTO_ADVANCE_DELAY_MS / 1000));
      }
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
    // Bewusst nur callId + initial-Status als Trigger — andere Felder von
    // activeCall sollen den Poll nicht neu starten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCall?.callId]);

  const startCurrentLead = useCallback(
    async (indexOverride?: number) => {
      const index = indexOverride ?? currentIndex;
      const lead = queue[index];
      if (!lead) return;
      const phoneToDial = lead.contact_phone ?? lead.phone;
      if (!phoneToDial) {
        addToast("Keine Telefonnummer vorhanden — überspringe.", "error");
        setCurrentIndex((i) => Math.min(i + 1, queue.length - 1));
        return;
      }

      const res = await queueStartCall({
        leadId: lead.id,
        phoneNumber: phoneToDial,
        contactId: null,
        provider,
      });
      if ("error" in res) {
        addToast(res.error, "error");
        setMode("idle");
        return;
      }
      setActiveCall({
        callId: res.callId,
        leadId: lead.id,
        provider,
        startedAt: Date.now(),
        status: "initiated",
      });
      setMode("calling");
    },
    [currentIndex, queue, provider, addToast],
  );

  const advance = useCallback(() => {
    setActiveCall(null);
    resetNotes();
    if (currentIndex < queue.length - 1) {
      setCurrentIndex((i) => i + 1);
      if (mode === "awaiting-next") {
        setMode("calling");
        setTimeout(() => startCurrentLead(currentIndex + 1), 400);
      } else {
        setMode("idle");
      }
    } else {
      setMode("idle");
      addToast("Queue durchgearbeitet.", "success");
    }
  }, [currentIndex, queue.length, mode, startCurrentLead, addToast, resetNotes]);

  // Countdown für Auto-Advance. State-Setter werden in setTimeout gewrappt,
  // damit sie nicht synchron im Effect-Body laufen (React 19 Regel).
  useEffect(() => {
    if (autoAdvanceSec == null) return;
    if (autoAdvanceSec <= 0) {
      const t = setTimeout(() => {
        setAutoAdvanceSec(null);
        advance();
      }, 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setAutoAdvanceSec((s) => (s == null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [autoAdvanceSec, advance]);

  function handleStart() {
    if (!currentLead) return;
    startCurrentLead();
  }

  function handleNext() {
    setActiveCall(null);
    setAutoAdvanceSec(null);
    resetNotes();
    if (currentIndex < queue.length - 1) {
      setCurrentIndex((i) => i + 1);
      setMode("idle");
    } else {
      setMode("idle");
      addToast("Letzter Lead erreicht.", "success");
    }
  }

  function handleStop() {
    setActiveCall(null);
    setAutoAdvanceSec(null);
    setMode("idle");
  }

  function handleContinueAfterAnswered() {
    // Nach „answered" hat der User gesprochen. Jetzt manuell weiter.
    setActiveCall(null);
    resetNotes();
    if (canNext) {
      setCurrentIndex((i) => i + 1);
      setMode("idle");
    } else {
      setMode("idle");
      addToast("Queue durchgearbeitet.", "success");
    }
  }

  function handleSaveNotes() {
    if (!activeCall || !currentLead || notes === savedNotes) return;
    startTransition(async () => {
      const res = await queueUpdateNotes(activeCall.callId, currentLead.id, notes);
      if ("error" in res) {
        addToast(res.error, "error");
      } else {
        setSavedNotes(notes);
        addToast("Notiz gespeichert.", "success");
      }
    });
  }

  function handleRemoveFromQueue(leadId: string) {
    setQueue((q) => q.filter((l) => l.id !== leadId));
    setCurrentIndex((i) => Math.min(i, queue.length - 2));
  }

  if (queue.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
        <PhoneOutgoing className="mx-auto h-8 w-8 text-gray-300" />
        <p className="mt-3 text-sm font-medium">Keine Kandidaten in der Queue</p>
        <p className="mt-1 text-xs text-gray-500">
          Qualifizierte Leads mit Telefonnummer, die in der letzten Stunde nicht schon angerufen wurden,
          erscheinen hier automatisch.
        </p>
      </div>
    );
  }

  const progress = queue.length > 0 ? Math.round(((currentIndex + (mode === "calling" ? 0 : 1)) / queue.length) * 100) : 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      {/* Queue-Liste */}
      <aside className="space-y-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Queue
            </p>
            <p className="text-xs text-gray-400">
              {currentIndex + 1} / {queue.length}
            </p>
          </div>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-[#2c2c2e]">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          {providers.phonemondo && providers.webex && (
            <div className="mt-3 flex items-center gap-2 text-xs">
              <span className="text-gray-500 dark:text-gray-400">Provider:</span>
              <div className="flex rounded-md border border-gray-200 p-0.5 dark:border-[#2c2c2e]">
                <button
                  type="button"
                  onClick={() => setProvider("phonemondo")}
                  className={`rounded px-2 py-0.5 ${
                    provider === "phonemondo" ? "bg-gray-200 font-medium dark:bg-white/10" : "text-gray-500"
                  }`}
                >
                  PhoneMondo
                </button>
                <button
                  type="button"
                  onClick={() => setProvider("webex")}
                  className={`rounded px-2 py-0.5 ${
                    provider === "webex" ? "bg-gray-200 font-medium dark:bg-white/10" : "text-gray-500"
                  }`}
                >
                  Webex
                </button>
              </div>
            </div>
          )}
        </div>

        <ul className="max-h-[calc(100vh-280px)] space-y-1.5 overflow-y-auto pr-1">
          {queue.map((lead, i) => {
            const active = i === currentIndex;
            const past = i < currentIndex;
            return (
              <li key={lead.id}>
                <button
                  onClick={() => {
                    if (mode === "calling") return;
                    if (i !== currentIndex) resetNotes();
                    setCurrentIndex(i);
                  }}
                  disabled={mode === "calling"}
                  className={`group w-full rounded-lg border p-2.5 text-left text-sm transition ${
                    active
                      ? "border-primary bg-primary/5"
                      : past
                      ? "border-gray-100 bg-gray-50/50 opacity-60 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]/40"
                      : "border-gray-100 hover:border-gray-300 dark:border-[#2c2c2e] dark:hover:border-[#3a3a3c]"
                  } disabled:cursor-not-allowed`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className={`truncate ${active ? "font-semibold" : "font-medium"}`}>
                      {lead.company_name}
                    </p>
                    {past && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
                    {active && mode === "calling" && (
                      <span className="inline-flex h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary" />
                    )}
                  </div>
                  {lead.contact_name && (
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {lead.contact_name}
                    </p>
                  )}
                  {(lead.contact_phone ?? lead.phone) && (
                    <p className="truncate text-[11px] text-gray-400">
                      {lead.contact_phone ?? lead.phone}
                    </p>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Current Lead */}
      <section className="space-y-4">
        {currentLead && (
          <>
            <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/crm/${currentLead.id}`}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Im CRM öffnen →
                  </Link>
                  <h2 className="mt-1 text-xl font-bold">{currentLead.company_name}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {currentLead.city && <span>{currentLead.city}</span>}
                    {currentLead.domain && <span>{currentLead.domain}</span>}
                    {currentLead.last_call_at && (
                      <span>
                        Letzter Kontakt: {new Date(currentLead.last_call_at).toLocaleString("de-DE")}
                      </span>
                    )}
                  </div>
                </div>
                <CallStatusBadge activeCall={activeCall} />
              </div>

              {/* Kontakt */}
              {currentLead.contact_name && (
                <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50/50 p-3 dark:border-[#2c2c2e] dark:bg-white/[0.02]">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Ansprechpartner
                  </p>
                  <p className="mt-1 font-medium">{currentLead.contact_name}</p>
                  {currentLead.contact_role && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">{currentLead.contact_role}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    {(currentLead.contact_phone ?? currentLead.phone) && (
                      <a
                        href={`tel:${currentLead.contact_phone ?? currentLead.phone}`}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        {currentLead.contact_phone ?? currentLead.phone}
                      </a>
                    )}
                    {currentLead.contact_email && (
                      <a
                        href={`mailto:${currentLead.contact_email}`}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        {currentLead.contact_email}
                      </a>
                    )}
                  </div>
                  {currentLead.contact_source_url && (
                    <a
                      href={currentLead.contact_source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      <Briefcase className="h-3 w-3" />
                      Aus Stellenanzeige
                    </a>
                  )}
                </div>
              )}

              {/* Controls */}
              <div className="mt-5 flex flex-wrap items-center gap-2">
                {mode === "idle" && (
                  <button
                    onClick={handleStart}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    <PhoneCall className="h-4 w-4" />
                    Anruf starten
                  </button>
                )}
                {mode === "calling" && (
                  <>
                    <button
                      onClick={handleStop}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 dark:border-[#2c2c2e] dark:hover:bg-white/5"
                    >
                      <Square className="h-4 w-4" />
                      Stop
                    </button>
                    {canNext && (
                      <button
                        onClick={handleNext}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 dark:border-[#2c2c2e] dark:hover:bg-white/5"
                      >
                        <SkipForward className="h-4 w-4" />
                        Überspringen
                      </button>
                    )}
                  </>
                )}
                {mode === "paused" && (
                  <>
                    <button
                      onClick={handleContinueAfterAnswered}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
                    >
                      <ChevronRight className="h-4 w-4" />
                      Gespräch beendet — nächster Lead
                    </button>
                    <button
                      onClick={handleStop}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 dark:border-[#2c2c2e] dark:hover:bg-white/5"
                    >
                      <Pause className="h-4 w-4" />
                      Queue pausieren
                    </button>
                  </>
                )}
                {mode === "awaiting-next" && autoAdvanceSec != null && (
                  <>
                    <div className="inline-flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                      <RotateCcw className="h-4 w-4 animate-spin" />
                      Nächster Lead in {autoAdvanceSec}s…
                    </div>
                    <button
                      onClick={() => {
                        setAutoAdvanceSec(null);
                        setMode("idle");
                      }}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 dark:border-[#2c2c2e] dark:hover:bg-white/5"
                    >
                      <Pause className="h-4 w-4" />
                      Abbrechen
                    </button>
                  </>
                )}

                <button
                  onClick={() => handleRemoveFromQueue(currentLead.id)}
                  disabled={mode === "calling" || mode === "paused"}
                  className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-white/5"
                >
                  <PhoneOff className="h-3.5 w-3.5" />
                  Aus Queue entfernen
                </button>
              </div>
            </div>

            {/* Inline-Notiz (nur während oder nach aktivem Call) */}
            {activeCall && (
              <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Gesprächsnotiz
                  </p>
                  <button
                    onClick={handleSaveNotes}
                    disabled={!notes || notes === savedNotes}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-40"
                  >
                    <Save className="h-3 w-3" />
                    Speichern
                  </button>
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  placeholder="Was wurde besprochen? Nächste Schritte?"
                  className="mt-2 w-full resize-none rounded-md border border-gray-200 bg-white p-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-[#2c2c2e] dark:bg-[#161618]"
                />
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function CallStatusBadge({ activeCall }: { activeCall: ActiveCall | null }) {
  if (!activeCall) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-white/5 dark:text-gray-300">
        <Play className="h-3 w-3" />
        Bereit
      </span>
    );
  }
  const s = activeCall.status;
  const classes =
    s === "answered"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
      : s === "ringing" || s === "initiated"
      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
      : s === "missed"
      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
      : s === "failed"
      ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
      : "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300";
  const Icon =
    s === "answered"
      ? PhoneIncoming
      : s === "missed"
      ? PhoneMissed
      : s === "failed"
      ? AlertCircle
      : PhoneOutgoing;
  const label =
    s === "initiated" || s === "ringing"
      ? "Verbinde…"
      : s === "answered"
      ? "Im Gespräch"
      : s === "missed"
      ? "Nicht erreicht"
      : s === "failed"
      ? "Fehlgeschlagen"
      : "Beendet";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
