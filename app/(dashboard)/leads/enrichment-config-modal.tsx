"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Sparkles, Loader2, Check, AlertTriangle, Send, CircleCheck, CircleX } from "lucide-react";
import type { Lead, EnrichmentConfig } from "@/lib/types";
import { DEFAULT_ENRICHMENT_CONFIG } from "@/lib/types";
import { bulkUpdateStatus } from "./actions";

interface Props {
  leadIds: string[];
  leads: Lead[];
  onClose: () => void;
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
  cancelled?: boolean;
  cancelReason?: string;
  error?: string;
}

type Phase = "configure" | "running" | "complete";

export function EnrichmentConfigModal({ leadIds, leads, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("configure");
  const [config, setConfig] = useState<EnrichmentConfig>({ ...DEFAULT_ENRICHMENT_CONFIG });
  const [results, setResults] = useState<EnrichResult[]>([]);
  const [currentLead, setCurrentLead] = useState<string>("");
  const [completed, setCompleted] = useState(0);
  const [qualifying, setQualifying] = useState(false);

  const total = leadIds.length;

  const startEnrichment = useCallback(async () => {
    setPhase("running");
    setResults([]);
    setCompleted(0);

    try {
      const res = await fetch("/api/enrich-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds, config }),
      });

      if (!res.ok || !res.body) {
        setResults([{ leadId: "", name: "", success: false, error: "Server-Fehler" }]);
        setPhase("complete");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "start") {
              setCurrentLead(event.name);
            } else if (event.type === "complete") {
              setCompleted((p) => p + 1);
              setResults((prev) => [...prev, {
                leadId: event.leadId,
                name: event.name ?? "",
                success: event.success,
                contactsCount: event.contactsCount,
                jobsCount: event.jobsCount,
                firstContactName: event.firstContactName,
                hasEmail: event.hasEmail,
                hasPhone: event.hasPhone,
                cancelled: event.cancelled,
                cancelReason: event.cancelReason,
                error: event.error,
              }]);
            } else if (event.type === "done") {
              setPhase("complete");
            }
          } catch { /* ignore */ }
        }
      }
      setPhase("complete");
    } catch {
      setPhase("complete");
    }
  }, [leadIds, config]);

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
  const readyResults = successResults.filter((r) => r.hasEmail && r.contactsCount && r.contactsCount > 0);
  const cancelledCount = results.filter((r) => r.cancelled).length;
  const errorCount = results.filter((r) => !r.success).length;

  async function handleQualify(ids: string[]) {
    setQualifying(true);
    await bulkUpdateStatus(ids, "qualified");
    setQualifying(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-3xl rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Lead-Anreicherung
          </h2>
          {phase !== "running" && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-6 py-4">
          {/* Phase 1: Konfiguration */}
          {phase === "configure" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {total} Lead(s) ausgewählt. Welche Daten sollen gesucht werden?
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: "contacts_management" as const, label: "Geschäftsführer", desc: "Inhaber & Management" },
                  { key: "contacts_all" as const, label: "Alle Kontakte", desc: "HR, Vertrieb & weitere" },
                  { key: "job_postings" as const, label: "Stellenanzeigen", desc: "Offene Jobs + Links" },
                  { key: "career_page" as const, label: "Karriereseite", desc: "Link zur Karriereseite" },
                  { key: "company_details" as const, label: "Firmendaten", desc: "Größe, Gründung, Fachgebiete" },
                ].map((item) => (
                  <label key={item.key} className="flex items-center gap-2.5 rounded-md border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-800">
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
              <button
                onClick={startEnrichment}
                className="w-full rounded-md bg-amber-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-600"
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
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all"
                    style={{ width: `${(completed / total) * 100}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Leads werden angereichert…
              </div>
              {results.length > 0 && (
                <div className="space-y-1">
                  {results.map((r) => (
                    <div key={r.leadId} className="flex items-center gap-2 text-sm">
                      {r.success && !r.cancelled && <Check className="h-3.5 w-3.5 text-green-500" />}
                      {r.cancelled && <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />}
                      {!r.success && !r.cancelled && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
                      <span className="font-medium">{r.name}</span>
                      {r.success && !r.cancelled && (
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
                <div className="flex-1 rounded-md border border-gray-200 py-2 dark:border-gray-800">
                  <p className="text-xl font-bold text-green-600 dark:text-green-400">{readyResults.length}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Export-bereit</p>
                </div>
                <div className="flex-1 rounded-md border border-gray-200 py-2 dark:border-gray-800">
                  <p className="text-xl font-bold">{successResults.length - readyResults.length}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Unvollständig</p>
                </div>
                <div className="flex-1 rounded-md border border-gray-200 py-2 dark:border-gray-800">
                  <p className="text-xl font-bold text-orange-600 dark:text-orange-400">{cancelledCount}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Ausgeschlossen</p>
                </div>
                <div className="flex-1 rounded-md border border-gray-200 py-2 dark:border-gray-800">
                  <p className="text-xl font-bold text-red-600 dark:text-red-400">{errorCount}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Fehler</p>
                </div>
              </div>

              {/* Vollständigkeits-Tabelle */}
              {results.length > 0 && (
                <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-800">
                  <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
                    <thead className="bg-gray-50 dark:bg-gray-800/50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Firma</th>
                        <th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Kontakt</th>
                        <th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400">E-Mail</th>
                        <th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Telefon</th>
                        <th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Stellen</th>
                        <th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {results.map((r) => (
                        <tr key={r.leadId}>
                          <td className="px-3 py-2 font-medium">{r.name}</td>
                          {r.success && !r.cancelled ? (
                            <>
                              <td className="px-3 py-2 text-center">
                                {r.contactsCount && r.contactsCount > 0
                                  ? <CircleCheck className="mx-auto h-4 w-4 text-green-500" />
                                  : <CircleX className="mx-auto h-4 w-4 text-red-400" />}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {r.hasEmail
                                  ? <CircleCheck className="mx-auto h-4 w-4 text-green-500" />
                                  : <CircleX className="mx-auto h-4 w-4 text-red-400" />}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {r.hasPhone
                                  ? <CircleCheck className="mx-auto h-4 w-4 text-green-500" />
                                  : <CircleX className="mx-auto h-4 w-4 text-gray-300 dark:text-gray-600" />}
                              </td>
                              <td className="px-3 py-2 text-center font-medium">
                                {r.jobsCount ?? 0}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {r.hasEmail && r.contactsCount && r.contactsCount > 0 ? (
                                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">Bereit</span>
                                ) : (
                                  <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">Lückenhaft</span>
                                )}
                              </td>
                            </>
                          ) : (
                            <>
                              <td colSpan={4} className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
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
                      ))}
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
                    {qualifying ? "Wird qualifiziert…" : `${readyResults.length} qualifizieren`}
                  </button>
                )}
                {successResults.length > readyResults.length && (
                  <button
                    onClick={() => handleQualify(successResults.map((r) => r.leadId))}
                    disabled={qualifying}
                    className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                  >
                    Alle {successResults.length} qualifizieren
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
