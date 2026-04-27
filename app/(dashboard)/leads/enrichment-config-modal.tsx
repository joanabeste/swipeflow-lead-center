"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, Sparkles, Loader2, Check, AlertTriangle, Send, CircleCheck, CircleX } from "lucide-react";
import type { EnrichmentConfig, ServiceMode, CompanyDetailField, LeadStatus } from "@/lib/types";
import { bulkUpdateStatus } from "./actions";
import { useToastContext } from "../toast-provider";
import { useServiceMode } from "@/lib/service-mode";

const POLL_INTERVAL_MS = 2000;

interface Props {
  leadIds: string[];
  onClose: () => void;
  defaults: Record<ServiceMode, EnrichmentConfig>;
}

interface EnrichResult {
  leadId: string;
  name: string;
  success: boolean;
  contactsCount?: number;
  jobsCount?: number;
  firstContactName?: string;
  hasEmail?: boolean;
  hasPhone?: boolean;
  // Webdev-Modus
  websiteIssues?: number;
  hasSsl?: boolean;
  isMobile?: boolean;
  websiteTech?: string;
  designEstimate?: string;
  cancelled?: boolean;
  cancelReason?: string;
  error?: string;
}

type Phase = "configure" | "running" | "complete";

const POST_ENRICH_STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: "enriched", label: "Angereichert" },
  { value: "qualified", label: "Qualifiziert" },
  { value: "exported", label: "Exportiert" },
];

export function EnrichmentConfigModal({ leadIds, onClose, defaults }: Props) {
  const { addToast } = useToastContext();
  const { mode: serviceMode } = useServiceMode();

  const [phase, setPhase] = useState<Phase>("configure");
  const [config, setConfig] = useState<EnrichmentConfig>({ ...defaults[serviceMode] });
  const [showDetailFields, setShowDetailFields] = useState(false);
  const [detailFields, setDetailFields] = useState<Set<CompanyDetailField>>(new Set());

  // Reset-State-on-Prop-Change ohne useEffect (React-19-Pattern):
  // Vergleich des vorherigen Modus mit dem aktuellen und setState während
  // des Renders, wenn er gewechselt hat. Vermeidet die setState-in-effect-
  // Warnung und den zusätzlichen Render eines Effect-basierten Resets.
  const [prevMode, setPrevMode] = useState(serviceMode);
  if (prevMode !== serviceMode) {
    setPrevMode(serviceMode);
    setConfig({ ...defaults[serviceMode] });
    setShowDetailFields(false);
    setDetailFields(new Set());
  }
  const [results, setResults] = useState<EnrichResult[]>([]);
  const [currentLead, setCurrentLead] = useState<string>("");
  const [completed, setCompleted] = useState(0);
  const [qualifying, setQualifying] = useState(false);
  const [targetStatus, setTargetStatus] = useState<LeadStatus>("qualified");
  const [jobId, setJobId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const total = leadIds.length;

  // Polling: sobald eine Job-ID bekannt ist, alle 2s den Status abrufen.
  // Die Background-Function läuft unabhängig weiter — Modal-Close bricht
  // NICHTS mehr ab. Beim Unmount räumt der Cleanup den Timer auf.
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    async function tick() {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/enrich-batch/status?id=${jobId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as {
          status: "pending" | "running" | "completed" | "failed";
          processed: number;
          currentLeadName: string | null;
          results: EnrichResult[];
          lastError: string | null;
        };
        if (cancelled) return;
        setResults(data.results);
        setCompleted(data.processed);
        setCurrentLead(data.currentLeadName ?? "");
        if (data.status === "completed" || data.status === "failed") {
          setPhase("complete");
          return; // Polling stoppen
        }
      } catch {
        // Netz-Wackler — einfach weiter pollen.
      }
      if (!cancelled) {
        pollRef.current = setTimeout(tick, POLL_INTERVAL_MS);
      }
    }
    pollRef.current = setTimeout(tick, 0);

    return () => {
      cancelled = true;
      if (pollRef.current) {
        clearTimeout(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [jobId]);

  const startEnrichment = useCallback(async () => {
    setPhase("running");
    setResults([]);
    setCompleted(0);
    setCurrentLead("");

    // Effektive Config: wenn Detail-Modus aktiv und Felder ausgewählt → Whitelist mitsenden
    const effectiveConfig: EnrichmentConfig = {
      ...config,
      company_details_fields:
        showDetailFields && detailFields.size > 0
          ? Array.from(detailFields)
          : undefined,
    };

    try {
      const res = await fetch("/api/enrich-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds, config: effectiveConfig, serviceMode }),
      });
      if (!res.ok) {
        setResults([{ leadId: "", name: "", success: false, error: `Server-Fehler (${res.status})` }]);
        setPhase("complete");
        return;
      }
      const data = (await res.json()) as { jobId: string };
      setJobId(data.jobId);
      // Ab hier übernimmt der Polling-Effect.
    } catch {
      setResults([{ leadId: "", name: "", success: false, error: "Netzwerk-Fehler" }]);
      setPhase("complete");
    }
  }, [leadIds, config, showDetailFields, detailFields, serviceMode]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    // Browser-Notification Permission anfragen
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Notification senden wenn fertig und Tab nicht sichtbar
  useEffect(() => {
    if (phase === "complete" && document.hidden && "Notification" in window && Notification.permission === "granted") {
      const ready = results.filter((r) => r.success && !r.cancelled).length;
      new Notification("Anreicherung abgeschlossen", {
        body: `${ready} Lead(s) bereit, ${results.filter((r) => !r.success).length} Fehler`,
      });
    }
  }, [phase, results]);

  const successResults = results.filter((r) => r.success && !r.cancelled);
  const readyResults = serviceMode === "webdev"
    ? successResults.filter((r) => (r.websiteIssues ?? 0) > 0)
    : successResults.filter((r) => r.hasEmail && r.contactsCount && r.contactsCount > 0);
  const cancelledCount = results.filter((r) => r.cancelled).length;
  const errorCount = results.filter((r) => !r.success).length;

  async function handleQualify(ids: string[]) {
    setQualifying(true);
    await bulkUpdateStatus(ids, targetStatus);
    setQualifying(false);
    const label = POST_ENRICH_STATUS_OPTIONS.find((o) => o.value === targetStatus)?.label ?? targetStatus;
    addToast(`${ids.length} Lead(s) auf „${label}“ gesetzt`, "success");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-3xl rounded-lg border border-gray-200 bg-white shadow-xl dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-[#2c2c2e]">
          <div className="flex items-center gap-3">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Sparkles className="h-5 w-5 text-primary" />
              Lead-Anreicherung
            </h2>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              serviceMode === "webdev"
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
            }`}>
              {serviceMode === "webdev" ? "Webentwicklung" : "Recruiting"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            title={phase === "running" ? "Schließen — Anreicherung läuft im Hintergrund weiter" : "Schließen"}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-6 py-4">
          {/* Phase 1: Konfiguration */}
          {phase === "configure" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {total} Lead(s) ausgewählt.
                {serviceMode === "webdev"
                  ? " Im Webentwicklung-Modus werden Geschäftsführer und Website-Qualität analysiert."
                  : " Im Recruiting-Modus werden Kontakte, Stellen und Karriereseiten gesucht."}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: "contacts_management" as const, label: "Geschäftsführer", desc: "Inhaber & Management" },
                  { key: "contacts_hr" as const, label: "HR-Verantwortliche", desc: "Personal, Recruiting, Ausbildung" },
                  { key: "contacts_all" as const, label: "Alle weiteren Kontakte", desc: "Vertrieb, Support, sonstige" },
                  { key: "job_postings" as const, label: "Stellenanzeigen", desc: "Offene Jobs + Links" },
                  { key: "career_page" as const, label: "Karriereseite", desc: "Link zur Karriereseite" },
                  { key: "company_details" as const, label: "Firmendaten", desc: "Größe, Gründung, Fachgebiete" },
                ].map((item) => (
                  <label key={item.key} className="flex items-center gap-2.5 rounded-md border border-gray-200 px-3 py-2.5 text-sm dark:border-[#2c2c2e]">
                    <input
                      type="checkbox"
                      checked={config[item.key]}
                      onChange={(e) => setConfig({ ...config, [item.key]: e.target.checked })}
                      className="rounded border-gray-300 dark:border-gray-600"
                    />
                    <div>
                      <span className="font-medium">{item.label}</span>
                      <span className="ml-1 text-xs text-gray-400">{item.desc}</span>
                    </div>
                  </label>
                ))}
              </div>

              {/* Detail-Modus: Nur bestimmte Firmendaten-Felder */}
              {config.company_details && (
                <div className="rounded-md border border-gray-200 dark:border-[#2c2c2e]">
                  <button
                    type="button"
                    onClick={() => setShowDetailFields((v) => !v)}
                    className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-white/5"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-medium">Nur bestimmte Firmendaten-Felder</span>
                      <span className="text-xs text-gray-400">(optional, spart Tokens)</span>
                    </span>
                    <span className="text-gray-400">{showDetailFields ? "▴" : "▾"}</span>
                  </button>
                  {showDetailFields && (
                    <div className="border-t border-gray-200 p-3 dark:border-[#2c2c2e]">
                      <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                        Nichts anhaken = alle Felder. Ausgewählte Felder werden gezielt gesucht und bereits gefüllte andere Felder bleiben unverändert.
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {([
                          { key: "address", label: "Adresse" },
                          { key: "phone", label: "Telefon" },
                          { key: "email", label: "E-Mail" },
                          { key: "legal_form", label: "Rechtsform" },
                          { key: "register_id", label: "Registernummer" },
                          { key: "company_size", label: "Größe" },
                          { key: "industry", label: "Branche" },
                          { key: "founding_year", label: "Gründungsjahr" },
                        ] as const).map((f) => (
                          <label key={f.key} className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-gray-50 dark:hover:bg-white/5">
                            <input
                              type="checkbox"
                              checked={detailFields.has(f.key)}
                              onChange={(e) => {
                                const next = new Set(detailFields);
                                if (e.target.checked) next.add(f.key);
                                else next.delete(f.key);
                                setDetailFields(next);
                              }}
                              className="rounded border-gray-300 dark:border-gray-600"
                            />
                            {f.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Ziel-Status nach Anreicherung */}
              <div className="rounded-md border border-gray-200 px-3 py-2.5 dark:border-[#2c2c2e]">
                <label htmlFor="target-status" className="block text-sm font-medium">
                  Ziel-Status nach Qualifizierung
                </label>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Wird gesetzt, wenn du die angereicherten Leads anschließend qualifizierst.
                </p>
                <select
                  id="target-status"
                  value={targetStatus}
                  onChange={(e) => setTargetStatus(e.target.value as LeadStatus)}
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-[#232325] dark:text-gray-100"
                >
                  {POST_ENRICH_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={startEnrichment}
                className="w-full rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
              >
                Anreicherung starten ({total} Lead{total > 1 ? "s" : ""})
              </button>
            </div>
          )}

          {/* Phase 2: Fortschritt */}
          {phase === "running" && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{completed} / {total}</span>
                  <span className="text-gray-500 dark:text-gray-400">{currentLead}</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-[#232325]">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${(completed / total) * 100}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Leads werden angereichert…
              </div>
              <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300">
                Du kannst dieses Fenster schließen — die Anreicherung läuft im Hintergrund weiter und du wirst benachrichtigt, wenn sie fertig ist.
              </p>
              {results.length > 0 && (
                <div className="space-y-1">
                  {results.map((r) => (
                    <div key={r.leadId} className="flex items-center gap-2 text-sm">
                      {r.success && !r.cancelled && <Check className="h-3.5 w-3.5 text-green-500" />}
                      {r.cancelled && <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />}
                      {!r.success && !r.cancelled && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
                      <span className="font-medium">{r.name}</span>
                      {r.success && !r.cancelled && serviceMode === "webdev" && (
                        <span className="text-gray-400">
                          {r.hasSsl ? "SSL" : "kein SSL"}, {r.isMobile ? "Mobil" : "nicht mobil"}, {r.websiteTech ?? "–"}, {r.designEstimate ?? "–"}{r.websiteIssues ? `, ${r.websiteIssues} Issues` : ""}
                        </span>
                      )}
                      {r.success && !r.cancelled && serviceMode !== "webdev" && (
                        <span className="text-gray-400">{r.contactsCount} Kontakte, {r.jobsCount} Stellen</span>
                      )}
                      {r.cancelled && <span className="text-orange-400">{r.cancelReason}</span>}
                      {!r.success && !r.cancelled && <span className="text-red-400">{r.error}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Phase 3: Ergebnis mit Vollständigkeits-Tabelle */}
          {phase === "complete" && (
            <div className="space-y-4">
              {/* Zusammenfassung */}
              <div className="flex gap-3 text-center">
                <div className="flex-1 rounded-md border border-gray-200 py-2 dark:border-[#2c2c2e]">
                  <p className="text-xl font-bold text-green-600 dark:text-green-400">{readyResults.length}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Export-bereit</p>
                </div>
                <div className="flex-1 rounded-md border border-gray-200 py-2 dark:border-[#2c2c2e]">
                  <p className="text-xl font-bold">{successResults.length - readyResults.length}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Unvollständig</p>
                </div>
                <div className="flex-1 rounded-md border border-gray-200 py-2 dark:border-[#2c2c2e]">
                  <p className="text-xl font-bold text-orange-600 dark:text-orange-400">{cancelledCount}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Ausgeschlossen</p>
                </div>
                <div className="flex-1 rounded-md border border-gray-200 py-2 dark:border-[#2c2c2e]">
                  <p className="text-xl font-bold text-red-600 dark:text-red-400">{errorCount}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Fehler</p>
                </div>
              </div>

              {/* Ergebnis-Tabelle (modus-abhängig) */}
              {results.length > 0 && (
                <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-[#2c2c2e]">
                  <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-[#2c2c2e]">
                    <thead className="bg-gray-50 dark:bg-[#232325]">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Firma</th>
                        {serviceMode === "webdev" ? (
                          <>
                            <th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400">SSL</th>
                            <th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Mobil</th>
                            <th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Technik</th>
                            <th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Design</th>
                            <th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Issues</th>
                          </>
                        ) : (
                          <>
                            <th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Kontakt</th>
                            <th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400">E-Mail</th>
                            <th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Telefon</th>
                            <th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Stellen</th>
                          </>
                        )}
                        <th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-[#2c2c2e]">
                      {results.map((r) => {
                        const isWebdev = serviceMode === "webdev";
                        const isOk = r.success && !r.cancelled;

                        return (
                        <tr key={r.leadId}>
                          <td className="px-3 py-2 font-medium">{r.name}</td>
                          {isOk && isWebdev && (
                            <>
                              <td className="px-3 py-2 text-center">
                                {r.hasSsl ? <CircleCheck className="mx-auto h-4 w-4 text-green-500" /> : <CircleX className="mx-auto h-4 w-4 text-red-400" />}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {r.isMobile ? <CircleCheck className="mx-auto h-4 w-4 text-green-500" /> : <CircleX className="mx-auto h-4 w-4 text-red-400" />}
                              </td>
                              <td className="px-3 py-2 text-center text-xs">{r.websiteTech ?? "–"}</td>
                              <td className="px-3 py-2 text-center">
                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                  r.designEstimate === "veraltet" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                                  r.designEstimate === "modern" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                                  "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                                }`}>{r.designEstimate === "veraltet" ? "Veraltet" : r.designEstimate === "modern" ? "Modern" : "OK"}</span>
                              </td>
                              <td className="px-3 py-2 text-center font-medium">{r.websiteIssues ?? 0}</td>
                              <td className="px-3 py-2 text-center">
                                {(r.websiteIssues ?? 0) > 0 ? (
                                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">Potenzial</span>
                                ) : (
                                  <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">Gut</span>
                                )}
                              </td>
                            </>
                          )}
                          {isOk && !isWebdev && (
                            <>
                              <td className="px-3 py-2 text-center">
                                {r.contactsCount && r.contactsCount > 0 ? <CircleCheck className="mx-auto h-4 w-4 text-green-500" /> : <CircleX className="mx-auto h-4 w-4 text-red-400" />}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {r.hasEmail ? <CircleCheck className="mx-auto h-4 w-4 text-green-500" /> : <CircleX className="mx-auto h-4 w-4 text-red-400" />}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {r.hasPhone ? <CircleCheck className="mx-auto h-4 w-4 text-green-500" /> : <CircleX className="mx-auto h-4 w-4 text-gray-300 dark:text-gray-600" />}
                              </td>
                              <td className="px-3 py-2 text-center font-medium">{r.jobsCount ?? 0}</td>
                              <td className="px-3 py-2 text-center">
                                {r.hasEmail && r.contactsCount && r.contactsCount > 0 ? (
                                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">Bereit</span>
                                ) : (
                                  <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">Lückenhaft</span>
                                )}
                              </td>
                            </>
                          )}
                          {!isOk && (
                            <>
                              <td colSpan={isWebdev ? 5 : 4} className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                                {r.cancelled ? (r.cancelReason ?? "Ausgeschlossen") : (r.error ?? "Fehler")}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {r.cancelled ? (
                                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">Ausgeschlossen</span>
                                ) : (
                                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">Fehler</span>
                                )}
                              </td>
                            </>
                          )}
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Aktions-Buttons */}
              <div className="flex flex-wrap gap-2">
                {readyResults.length > 0 && (
                  <button
                    onClick={() => handleQualify(readyResults.map((r) => r.leadId))}
                    disabled={qualifying}
                    className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {qualifying ? "Wird gesetzt…" : `${readyResults.length} auf „${POST_ENRICH_STATUS_OPTIONS.find((o) => o.value === targetStatus)?.label}“ setzen`}
                  </button>
                )}
                {successResults.length > readyResults.length && (
                  <button
                    onClick={() => handleQualify(successResults.map((r) => r.leadId))}
                    disabled={qualifying}
                    className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                  >
                    Alle {successResults.length} auf „{POST_ENRICH_STATUS_OPTIONS.find((o) => o.value === targetStatus)?.label}“ setzen
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                >
                  Schließen
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
