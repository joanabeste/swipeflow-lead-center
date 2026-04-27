"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, AlertTriangle, Clock, Globe, RefreshCw, Ban } from "lucide-react";
import type { LeadEnrichment } from "@/lib/types";
import { abortEnrichment } from "./enrichment-actions";

interface Props {
  enrichment: LeadEnrichment;
  leadId: string;
  onClose: () => void;
}

function formatElapsed(startedAt: string, until: number): string {
  const start = new Date(startedAt).getTime();
  const sec = Math.max(0, Math.floor((until - start) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function EnrichmentDiagnosisModal({ enrichment, leadId, onClose }: Props) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [aborting, startAbort] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isRunning = enrichment.status === "running";
  const isFailed = enrichment.status === "failed";

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  function handleAbort() {
    if (!confirm("Diese Anreicherung als fehlgeschlagen markieren? Der Lead wird wieder auf 'Importiert' gesetzt, sodass er erneut angereichert werden kann.")) return;
    setError(null);
    startAbort(async () => {
      const res = await abortEnrichment(enrichment.id, leadId);
      if (res.error) {
        setError(res.error);
      } else {
        router.refresh();
        onClose();
      }
    });
  }

  function handleRefresh() {
    router.refresh();
    setNow(Date.now());
  }

  const elapsed = enrichment.started_at ? formatElapsed(enrichment.started_at, isRunning ? now : new Date(enrichment.completed_at ?? enrichment.started_at).getTime()) : "—";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg bg-white shadow-xl dark:bg-[#1c1c1e]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-[#2c2c2e]">
          <h2 className="flex items-center gap-2 font-semibold">
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin text-yellow-600" />
            ) : isFailed ? (
              <AlertTriangle className="h-4 w-4 text-red-600" />
            ) : (
              <Clock className="h-4 w-4 text-gray-500" />
            )}
            Anreicherungs-Diagnose
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              {isRunning ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                  Läuft seit {elapsed}
                </span>
              ) : isFailed ? (
                <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  Fehlgeschlagen
                </span>
              ) : (
                <span className="text-gray-500">{enrichment.status}</span>
              )}
            </Field>
            <Field label="Gestartet">
              <span className="text-gray-600 dark:text-gray-300">
                {enrichment.started_at ? new Date(enrichment.started_at).toLocaleString("de-DE") : "—"}
              </span>
            </Field>
            <Field label="Quelle">
              <span className="text-gray-600 dark:text-gray-300">{enrichment.source ?? "—"}</span>
            </Field>
            <Field label="Dauer">
              <span className="text-gray-600 dark:text-gray-300">{elapsed}</span>
            </Field>
          </div>

          {enrichment.error_message && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-900/20">
              <p className="text-xs font-semibold text-red-800 dark:text-red-300">Fehlermeldung</p>
              <p className="mt-1 break-words text-xs text-red-700 dark:text-red-400">
                {enrichment.error_message}
              </p>
            </div>
          )}

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300">
              <Globe className="h-3.5 w-3.5" />
              Bisher abgerufene Seiten {enrichment.pages_fetched?.length ? `(${enrichment.pages_fetched.length})` : ""}
            </p>
            {enrichment.pages_fetched && enrichment.pages_fetched.length > 0 ? (
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-gray-100 bg-gray-50 p-2 text-xs dark:border-[#2c2c2e] dark:bg-[#232325]">
                {enrichment.pages_fetched.map((url) => (
                  <li key={url} className="truncate">
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-primary hover:underline"
                    >
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {isRunning
                  ? "Noch keine Seite abgeschlossen — der Job hängt vermutlich beim Fetching oder LLM-Aufruf."
                  : "Keine Seiten abgerufen."}
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-5 py-3 dark:border-[#2c2c2e]">
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Aktualisieren
          </button>
          {isRunning && (
            <button
              onClick={handleAbort}
              disabled={aborting}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-900/20"
            >
              {aborting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
              Als fehlgeschlagen markieren
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
