"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle, Briefcase, Building2, CheckCircle2, ChevronRight, ExternalLink,
  Globe, Hash, History, Info, Lock, Mail, MapPin, Pause, Phone,
  PhoneCall, PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing, Play,
  PowerOff, RotateCcw, Save, ShieldCheck, SkipForward, Sparkles, Square,
  StickyNote, Users, Zap,
} from "lucide-react";
import type { CallProvider } from "../crm/actions";
import {
  getCallStatus,
  loadActiveLeadDetails,
  queueStartCall,
  queueUpdateNotes,
  saveCallQueueStatusIds,
  type ActiveLeadDetails,
  type CallStatus,
  type CustomStatusOption,
  type QueueLead,
} from "./actions";
import { useToastContext } from "../toast-provider";
import type { CallQueueSettings } from "@/lib/app-settings";

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
  settings,
  customStatuses,
  selectedStatusIds,
}: {
  initialQueue: QueueLead[];
  providers: { phonemondo: boolean; webex: boolean };
  settings: CallQueueSettings;
  customStatuses: CustomStatusOption[];
  selectedStatusIds: string[];
}) {
  const { addToast } = useToastContext();
  const router = useRouter();
  const ringTimeoutMs = settings.ringTimeoutSeconds * 1000;
  const advanceMs = settings.autoAdvanceDelaySeconds * 1000;
  const [queue, setQueue] = useState<QueueLead[]>(initialQueue);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [mode, setMode] = useState<QueueMode>("idle");
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [autoAdvanceSec, setAutoAdvanceSec] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [savedNotes, setSavedNotes] = useState("");
  const [, startTransition] = useTransition();
  const [statusSaving, startStatusTransition] = useTransition();

  const defaultProvider: CallProvider = providers.phonemondo ? "phonemondo" : "webex";
  const [provider, setProvider] = useState<CallProvider>(defaultProvider);

  const currentLead = queue[currentIndex] ?? null;
  const canNext = currentIndex < queue.length - 1;

  // Aktiver Kontakt pro Lead (HR-Default). Wechselt mit dem Lead automatisch.
  const [activeContactIdByLead, setActiveContactIdByLead] = useState<Record<string, string>>({});
  const activeContactId = currentLead
    ? activeContactIdByLead[currentLead.id] ?? currentLead.default_contact_id
    : null;
  const activeContact = currentLead?.contacts.find((c) => c.id === activeContactId) ?? null;

  function selectContact(contactId: string) {
    if (!currentLead) return;
    setActiveContactIdByLead((m) => ({ ...m, [currentLead.id]: contactId }));
  }

  // Detail-Daten (Notizen, Call-History, Jobs) für den aktiven Lead.
  // Werden lazy nachgeladen, damit die Queue-Liste schlank bleibt.
  const [leadDetails, setLeadDetails] = useState<ActiveLeadDetails | null>(null);
  const [leadDetailsLoading, setLeadDetailsLoading] = useState(false);
  useEffect(() => {
    if (!currentLead) {
      setLeadDetails(null);
      return;
    }
    const leadId = currentLead.id;
    let cancelled = false;
    // Stale Daten beim Lead-Wechsel sofort verwerfen, sonst werden kurz
    // Notizen/Anrufe vom vorigen Lead angezeigt, was irreführend wirkt.
    setLeadDetails(null);
    setLeadDetailsLoading(true);
    loadActiveLeadDetails(leadId).then((res) => {
      if (cancelled) return;
      setLeadDetails(res);
      setLeadDetailsLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLead?.id]);

  const resetNotes = useCallback(() => {
    setNotes("");
    setSavedNotes("");
  }, []);

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
        setAutoAdvanceSec(Math.floor(advanceMs / 1000));
      }
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCall?.callId, advanceMs]);

  // Ring-Timeout: Fallback, falls der Provider-Webhook keinen missed/failed-
  // Status schickt. Nach `ringTimeoutMs` wird der Call manuell als verpasst
  // markiert und der Auto-Advance-Countdown gestartet.
  useEffect(() => {
    if (!activeCall) return;
    if (activeCall.status !== "initiated" && activeCall.status !== "ringing") return;
    const callId = activeCall.callId;
    const timer = setTimeout(() => {
      setActiveCall((prev) => {
        if (!prev || prev.callId !== callId) return prev;
        if (prev.status === "answered" || prev.status === "ended") return prev;
        return { ...prev, status: "missed" };
      });
      setMode("awaiting-next");
      setAutoAdvanceSec(Math.floor(advanceMs / 1000));
    }, ringTimeoutMs);
    return () => clearTimeout(timer);
  }, [activeCall, ringTimeoutMs, advanceMs]);

  const startCurrentLead = useCallback(
    async (indexOverride?: number) => {
      const index = indexOverride ?? currentIndex;
      const lead = queue[index];
      if (!lead) return;
      const selectedId = activeContactIdByLead[lead.id] ?? lead.default_contact_id;
      const selectedContact = lead.contacts.find((c) => c.id === selectedId) ?? null;
      const phoneToDial = selectedContact?.phone ?? lead.phone;
      if (!phoneToDial) {
        addToast("Keine Telefonnummer vorhanden — überspringe.", "error");
        setCurrentIndex((i) => Math.min(i + 1, queue.length - 1));
        return;
      }

      const res = await queueStartCall({
        leadId: lead.id,
        phoneNumber: phoneToDial,
        contactId: selectedContact?.id ?? null,
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
    [currentIndex, queue, provider, addToast, activeContactIdByLead],
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

  function handleHardStop() {
    setActiveCall(null);
    setAutoAdvanceSec(null);
    setMode("idle");
    resetNotes();
    addToast("Auto-Dialer gestoppt.", "success");
  }

  function handleContinueAfterAnswered() {
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
    const lead = queue.find((l) => l.id === leadId);
    const label = lead?.company_name ?? "diesen Lead";
    if (!confirm(`„${label}" aus der Queue entfernen?`)) return;
    setQueue((q) => q.filter((l) => l.id !== leadId));
    setCurrentIndex((i) => Math.min(i, queue.length - 2));
  }

  function toggleStatus(id: string) {
    const next = selectedStatusIds.includes(id)
      ? selectedStatusIds.filter((s) => s !== id)
      : [...selectedStatusIds, id];
    startStatusTransition(async () => {
      const res = await saveCallQueueStatusIds(next);
      if ("error" in res) {
        addToast(res.error, "error");
      } else {
        router.refresh();
      }
    });
  }

  const hasSelection = selectedStatusIds.length > 0;
  const queueRunning = mode !== "idle" || activeCall !== null;

  return (
    <div className="space-y-5">
      <TopBar
        customStatuses={customStatuses}
        selectedStatusIds={selectedStatusIds}
        statusSaving={statusSaving}
        onToggleStatus={toggleStatus}
        onHardStop={handleHardStop}
        queueRunning={queueRunning}
      />

      {!hasSelection ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
          <PhoneOutgoing className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-3 text-sm font-medium">Noch kein CRM-Status ausgewählt</p>
          <p className="mt-1 text-xs text-gray-500">
            Wähle oben mindestens einen CRM-Status aus — Leads mit diesem Status und einer Telefonnummer landen automatisch in der Queue.
          </p>
          {customStatuses.length === 0 && (
            <Link href="/einstellungen/crm-status" className="mt-4 inline-block text-xs font-medium text-primary hover:underline">
              CRM-Status anlegen →
            </Link>
          )}
        </div>
      ) : queue.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
          <PhoneOutgoing className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-3 text-sm font-medium">Keine Kandidaten in der Queue</p>
          <p className="mt-1 text-xs text-gray-500">
            Leads mit Telefonnummer im gewählten Status, die in der letzten Stunde nicht schon angerufen wurden, erscheinen hier automatisch.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
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
                  style={{ width: `${queue.length > 0 ? Math.round(((currentIndex + (mode === "calling" ? 0 : 1)) / queue.length) * 100) : 0}%` }}
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

            <ul className="max-h-[calc(100vh-320px)] space-y-1.5 overflow-y-auto pr-1">
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
                      {(() => {
                        const defaultC = lead.contacts.find((c) => c.id === lead.default_contact_id) ?? lead.contacts[0] ?? null;
                        if (!defaultC) return null;
                        const prefix = defaultC.salutation === "herr" ? "Hr. " : defaultC.salutation === "frau" ? "Fr. " : "";
                        return (
                          <>
                            <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                              {prefix}{defaultC.name}
                              {defaultC.is_hr && <span className="ml-1 rounded bg-emerald-100 px-1 py-0 text-[9px] font-semibold uppercase text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">HR</span>}
                              {defaultC.role && <span className="text-gray-400"> · {defaultC.role}</span>}
                            </p>
                            {(defaultC.phone ?? lead.phone) && (
                              <p className="truncate text-[11px] text-gray-400">
                                {defaultC.phone ?? lead.phone}
                              </p>
                            )}
                            {lead.contacts.length > 1 && (
                              <p className="text-[10px] text-gray-400">+{lead.contacts.length - 1} weitere</p>
                            )}
                          </>
                        );
                      })()}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {lead.crm_status_label && (
                          <StatusDot label={lead.crm_status_label} color={lead.crm_status_color} />
                        )}
                        {lead.industry && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600 dark:bg-white/5 dark:text-gray-400">
                            {lead.industry}
                          </span>
                        )}
                        {lead.job_postings_count > 0 && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                            <Briefcase className="h-2.5 w-2.5" />
                            {lead.job_postings_count}
                          </span>
                        )}
                      </div>
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
                        {currentLead.city && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {currentLead.city}
                            {currentLead.distance_km != null && (
                              <span className="text-gray-400"> · {currentLead.distance_km} km</span>
                            )}
                          </span>
                        )}
                        {currentLead.domain && <span>{currentLead.domain}</span>}
                      </div>
                    </div>
                    <CallStatusBadge activeCall={activeCall} />
                  </div>

                  {/* Info-Pills */}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {currentLead.crm_status_label && (
                      <StatusDot label={currentLead.crm_status_label} color={currentLead.crm_status_color} />
                    )}
                    {currentLead.industry && (
                      <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 dark:bg-white/5 dark:text-gray-400">
                        {currentLead.industry}
                      </span>
                    )}
                    {currentLead.job_postings_count > 0 && (
                      <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                        <Briefcase className="h-3 w-3" />
                        {currentLead.job_postings_count} {currentLead.job_postings_count === 1 ? "Stellenanzeige" : "Stellenanzeigen"}
                      </span>
                    )}
                    {currentLead.website && (
                      <a
                        href={currentLead.website}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-200 dark:bg-white/5 dark:text-gray-300"
                      >
                        <Globe className="h-3 w-3" />
                        Website
                      </a>
                    )}
                    {currentLead.career_page_url && (
                      <a
                        href={currentLead.career_page_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300"
                      >
                        <Briefcase className="h-3 w-3" />
                        Karriereseite
                      </a>
                    )}
                  </div>

                  {/* Letzter Kontakt */}
                  {currentLead.last_call_at && (
                    <div className="mt-3 rounded-md border border-gray-100 bg-gray-50/60 p-2.5 text-xs dark:border-[#2c2c2e] dark:bg-white/[0.02]">
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                        <Info className="h-3.5 w-3.5" />
                        <span className="font-medium">Letzter Kontakt:</span>
                        <span>{new Date(currentLead.last_call_at).toLocaleString("de-DE")}</span>
                        {currentLead.last_call_status && (
                          <LastCallStatusPill status={currentLead.last_call_status} />
                        )}
                      </div>
                      {currentLead.last_call_notes && (
                        <p className="mt-1 line-clamp-2 text-gray-500 dark:text-gray-400">
                          {currentLead.last_call_notes}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Kontakt-Auswahl + Details */}
                  {currentLead.contacts.length > 0 && (
                    <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50/50 p-3 dark:border-[#2c2c2e] dark:bg-white/[0.02]">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Ansprechpartner
                        </p>
                        {currentLead.contacts.length > 1 && (
                          <span className="text-[10px] text-gray-400">
                            {currentLead.contacts.length} Kontakte
                          </span>
                        )}
                      </div>

                      {/* Picker-Row bei > 1 Kontakt */}
                      {currentLead.contacts.length > 1 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {currentLead.contacts.map((c) => {
                            const selected = c.id === activeContactId;
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => selectContact(c.id)}
                                disabled={mode === "calling"}
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${
                                  selected
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-[#2c2c2e] dark:bg-[#161618] dark:text-gray-300"
                                } disabled:opacity-50`}
                                title={c.phone ? `Anrufen: ${c.phone}` : "Keine Telefonnummer"}
                              >
                                {c.is_hr && (
                                  <span className="rounded bg-emerald-100 px-1 text-[9px] font-semibold uppercase text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                    HR
                                  </span>
                                )}
                                <span className="truncate max-w-[160px]">{c.name}</span>
                                {!c.phone && <span className="text-gray-400">(ohne Tel)</span>}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {activeContact && (
                        <>
                          <p className="mt-2 font-medium">
                            <span className="text-gray-500">
                              {activeContact.salutation === "herr" ? "Hr. " : activeContact.salutation === "frau" ? "Fr. " : ""}
                            </span>
                            {activeContact.name}
                            {activeContact.is_hr && (
                              <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                HR
                              </span>
                            )}
                          </p>
                          {activeContact.role && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">{activeContact.role}</p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                            {(activeContact.phone ?? currentLead.phone) && (
                              <a
                                href={`tel:${activeContact.phone ?? currentLead.phone}`}
                                className="inline-flex items-center gap-1 text-primary hover:underline"
                              >
                                <Phone className="h-3.5 w-3.5" />
                                {activeContact.phone ?? currentLead.phone}
                              </a>
                            )}
                            {activeContact.email && (
                              <a
                                href={`mailto:${activeContact.email}`}
                                className="inline-flex items-center gap-1 text-primary hover:underline"
                              >
                                <Mail className="h-3.5 w-3.5" />
                                {activeContact.email}
                              </a>
                            )}
                          </div>
                          {activeContact.source_url && (
                            <a
                              href={activeContact.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline dark:text-indigo-400"
                            >
                              <Briefcase className="h-3 w-3" />
                              Aus Stellenanzeige
                            </a>
                          )}
                        </>
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
                          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-primary-dark"
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

                {/* Inline-Notiz (nur während oder nach aktivem Call) —
                    steht direkt unter dem Haupt-Panel, damit sie beim Telefonieren
                    ohne Scrollen erreichbar ist. Details folgen darunter. */}
                {activeCall && (
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Gesprächsnotiz
                      </p>
                      <button
                        onClick={handleSaveNotes}
                        disabled={!notes || notes === savedNotes}
                        className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-gray-900 hover:bg-primary-dark disabled:opacity-40"
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

                <LeadDetailSections
                  lead={currentLead}
                  details={leadDetails}
                  loading={leadDetailsLoading}
                />
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function TopBar({
  customStatuses,
  selectedStatusIds,
  statusSaving,
  onToggleStatus,
  onHardStop,
  queueRunning,
}: {
  customStatuses: CustomStatusOption[];
  selectedStatusIds: string[];
  statusSaving: boolean;
  onToggleStatus: (id: string) => void;
  onHardStop: () => void;
  queueRunning: boolean;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            In der Queue: CRM-Status
          </p>
          {customStatuses.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">
              Noch keine custom CRM-Status angelegt.{" "}
              <Link href="/einstellungen/crm-status" className="font-medium text-primary hover:underline">
                Jetzt erstellen →
              </Link>
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {customStatuses.map((s) => {
                const selected = selectedStatusIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onToggleStatus(s.id)}
                    disabled={statusSaving}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-[#2c2c2e] dark:bg-[#161618] dark:text-gray-300"
                    } disabled:opacity-50`}
                    title={selected ? "Aus Queue entfernen" : "Zur Queue hinzufügen"}
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: s.color || "#6b7280" }}
                    />
                    {s.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onHardStop}
          disabled={!queueRunning}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
            queueRunning
              ? "bg-red-600 text-white hover:bg-red-700"
              : "bg-gray-100 text-gray-400 dark:bg-white/5 dark:text-gray-600"
          } disabled:cursor-not-allowed`}
          title={queueRunning ? "Aktiven Call abbrechen und Queue anhalten" : "Queue läuft nicht"}
        >
          <PowerOff className="h-4 w-4" />
          Queue beenden
        </button>
      </div>
    </div>
  );
}

function StatusDot({ label, color }: { label: string; color: string | null }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-700 dark:bg-white/5 dark:text-gray-300">
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color || "#6b7280" }}
      />
      {label}
    </span>
  );
}

function LastCallStatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    initiated: { label: "gewählt", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
    ringing: { label: "klingelt", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
    answered: { label: "angenommen", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
    missed: { label: "verpasst", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
    failed: { label: "fehlgeschlagen", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
    ended: { label: "beendet", cls: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400" },
  };
  const m = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400" };
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${m.cls}`}>{m.label}</span>;
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

// ─── Detail-Sektionen für den aktiven Lead ──────────────────────────

function DetailCard({
  icon: Icon,
  title,
  children,
  right,
}: {
  icon: typeof Building2;
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          <Icon className="h-3.5 w-3.5" />
          {title}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function DataRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {label}
      </dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function formatAddress(lead: QueueLead): string | null {
  const line1 = lead.street ?? "";
  const line2 = [lead.zip, lead.city].filter(Boolean).join(" ");
  const line3 = [lead.state, lead.country].filter(Boolean).join(", ");
  const parts = [line1, line2, line3].filter((x) => x.trim().length > 0);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, "0")} min` : `${s}s`;
}

function LeadDetailSections({
  lead,
  details,
  loading,
}: {
  lead: QueueLead;
  details: ActiveLeadDetails | null;
  loading: boolean;
}) {
  const address = formatAddress(lead);
  const hasCompanyData =
    address ||
    lead.email ||
    lead.company_size ||
    lead.legal_form ||
    lead.register_id ||
    lead.description;
  const hasTechData =
    lead.website ||
    lead.career_page_url ||
    lead.has_ssl != null ||
    lead.page_speed_score != null ||
    lead.website_tech ||
    lead.enriched_at;

  return (
    <>
      {hasCompanyData && (
        <DetailCard icon={Building2} title="Unternehmen">
          <dl className="divide-y divide-gray-100 dark:divide-[#2c2c2e]">
            {address && (
              <DataRow label="Adresse">
                <span className="inline-flex items-start gap-1.5">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <span>{address}</span>
                </span>
              </DataRow>
            )}
            {lead.email && (
              <DataRow label="E-Mail">
                <a
                  href={`mailto:${lead.email}`}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {lead.email}
                </a>
              </DataRow>
            )}
            {lead.company_size && (
              <DataRow label="Größe">
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5 text-gray-400" />
                  {lead.company_size}
                </span>
              </DataRow>
            )}
            {lead.legal_form && (
              <DataRow label="Rechtsform">{lead.legal_form}</DataRow>
            )}
            {lead.register_id && (
              <DataRow label="Register-Nr.">
                <span className="inline-flex items-center gap-1 font-mono text-xs">
                  <Hash className="h-3 w-3 text-gray-400" />
                  {lead.register_id}
                </span>
              </DataRow>
            )}
            {lead.description && (
              <DataRow label="Beschreibung">
                <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                  {lead.description}
                </p>
              </DataRow>
            )}
          </dl>
        </DetailCard>
      )}

      {hasTechData && (
        <DetailCard icon={Globe} title="Website & Tech">
          <dl className="divide-y divide-gray-100 dark:divide-[#2c2c2e]">
            {lead.website && (
              <DataRow label="Website">
                <a
                  href={lead.website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {lead.website}
                </a>
              </DataRow>
            )}
            {lead.career_page_url && (
              <DataRow label="Karriereseite">
                <a
                  href={lead.career_page_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  <Briefcase className="h-3.5 w-3.5" />
                  {lead.career_page_url}
                </a>
              </DataRow>
            )}
            {lead.has_ssl != null && (
              <DataRow label="SSL">
                {lead.has_ssl ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                    <Lock className="h-3.5 w-3.5" />
                    aktiv
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    inaktiv
                  </span>
                )}
              </DataRow>
            )}
            {lead.page_speed_score != null && (
              <DataRow label="Page Speed">
                <span className="inline-flex items-center gap-1">
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                  {lead.page_speed_score} / 100
                </span>
              </DataRow>
            )}
            {lead.website_tech && (
              <DataRow label="Tech">
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {lead.website_tech}
                </span>
              </DataRow>
            )}
            {lead.enriched_at && (
              <DataRow label="Angereichert">
                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                  <Sparkles className="h-3 w-3 text-purple-500" />
                  {new Date(lead.enriched_at).toLocaleString("de-DE")}
                  {lead.enrichment_source && (
                    <span className="text-gray-400"> · {lead.enrichment_source}</span>
                  )}
                </span>
              </DataRow>
            )}
          </dl>
        </DetailCard>
      )}

      {details && details.jobs.length > 0 && (
        <DetailCard
          icon={Briefcase}
          title="Stellenanzeigen"
          right={
            <span className="text-[11px] text-gray-400">
              {details.jobs.length} {details.jobs.length === 1 ? "Eintrag" : "Einträge"}
            </span>
          }
        >
          <ul className="space-y-2">
            {details.jobs.map((job) => (
              <li
                key={job.id}
                className="rounded-lg border border-gray-100 p-2.5 dark:border-[#2c2c2e]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{job.title}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
                      {job.location && (
                        <span className="inline-flex items-center gap-0.5">
                          <MapPin className="h-3 w-3" />
                          {job.location}
                        </span>
                      )}
                      {job.posted_date && (
                        <span>
                          {new Date(job.posted_date).toLocaleDateString("de-DE")}
                        </span>
                      )}
                      {job.source && (
                        <span className="rounded bg-gray-100 px-1 text-[10px] text-gray-600 dark:bg-white/5 dark:text-gray-400">
                          {job.source}
                        </span>
                      )}
                    </div>
                  </div>
                  {job.url && (
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-gray-400 hover:text-primary"
                      title="Anzeige öffnen"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </DetailCard>
      )}

      {details && details.notes.length > 0 && (
        <DetailCard
          icon={StickyNote}
          title="Letzte Notizen"
          right={
            <span className="text-[11px] text-gray-400">
              {details.notes.length} von max. 3
            </span>
          }
        >
          <ul className="space-y-2">
            {details.notes.map((note) => (
              <li
                key={note.id}
                className="rounded-lg border border-gray-100 bg-gray-50/40 p-3 dark:border-[#2c2c2e] dark:bg-white/[0.02]"
              >
                <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500">
                  <span>{note.author_name || "—"}</span>
                  <span>{new Date(note.created_at).toLocaleString("de-DE")}</span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                  {note.content}
                </p>
              </li>
            ))}
          </ul>
        </DetailCard>
      )}

      {details && details.calls.length > 0 && (
        <DetailCard
          icon={History}
          title="Anrufhistorie"
          right={
            <span className="text-[11px] text-gray-400">
              letzte {details.calls.length}
            </span>
          }
        >
          <ul className="space-y-2">
            {details.calls.map((call) => {
              const Icon =
                call.direction === "inbound" ? PhoneIncoming : PhoneOutgoing;
              return (
                <li
                  key={call.id}
                  className="rounded-lg border border-gray-100 p-2.5 dark:border-[#2c2c2e]"
                >
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                    <Icon className="h-3.5 w-3.5 text-gray-400" />
                    <span>
                      {new Date(call.started_at).toLocaleString("de-DE")}
                    </span>
                    {call.status && <LastCallStatusPill status={call.status} />}
                    <span className="text-gray-400">
                      {formatDuration(call.duration_seconds)}
                    </span>
                    {call.phone_number && (
                      <span className="font-mono text-gray-400">
                        {call.phone_number}
                      </span>
                    )}
                  </div>
                  {call.notes && (
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                      {call.notes}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </DetailCard>
      )}

      {loading && !details && (
        <div className="space-y-4">
          <div className="h-28 animate-pulse rounded-2xl border border-gray-200 bg-gray-50 dark:border-[#2c2c2e]/50 dark:bg-white/[0.02]" />
          <div className="h-28 animate-pulse rounded-2xl border border-gray-200 bg-gray-50 dark:border-[#2c2c2e]/50 dark:bg-white/[0.02]" />
        </div>
      )}

      {!loading && details && !hasCompanyData && !hasTechData &&
        details.jobs.length === 0 && details.notes.length === 0 && details.calls.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center text-xs text-gray-400 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
            Keine weiteren Details für diesen Lead verfügbar.
          </div>
        )}
    </>
  );
}
