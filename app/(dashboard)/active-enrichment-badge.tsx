"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useToastContext } from "./toast-provider";

const POLL_MS = 3000;

interface ActiveJob {
  id: string;
  status: "pending" | "running";
  total: number;
  processed: number;
  currentLeadName: string | null;
}

interface StatusResponse {
  status: "pending" | "running" | "completed" | "failed";
  total: number;
  processed: number;
  lastError: string | null;
  results: { success: boolean; cancelled?: boolean }[];
}

/**
 * Globaler Badge, der laufende Enrichment-Jobs des aktuellen Users anzeigt
 * und Toast + Notification feuert, wenn einer fertig wird.
 *
 * Läuft im Dashboard-Header; rendert nichts, wenn keine Jobs aktiv sind.
 */
export function ActiveEnrichmentBadge() {
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const previousIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);
  const { addToast } = useToastContext();

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function fetchFinalStatus(id: string): Promise<StatusResponse | null> {
      try {
        const res = await fetch(`/api/enrich-batch/status?id=${id}`);
        if (!res.ok) return null;
        return (await res.json()) as StatusResponse;
      } catch {
        return null;
      }
    }

    async function tick() {
      if (cancelled) return;
      try {
        const res = await fetch("/api/enrich-batch/active");
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { jobs: ActiveJob[] };
        if (cancelled) return;

        const newIds = new Set(data.jobs.map((j) => j.id));

        // Jobs, die seit dem letzten Tick verschwunden sind → completed oder failed.
        // Nur feuern nach erster Initialisierung, damit Reload keine Ghost-Toasts auslöst.
        if (initialized.current) {
          const finishedIds = [...previousIds.current].filter((id) => !newIds.has(id));
          for (const id of finishedIds) {
            const final = await fetchFinalStatus(id);
            if (!final) continue;
            const ok = final.results.filter((r) => r.success && !r.cancelled).length;
            const errors = final.results.filter((r) => !r.success).length;
            if (final.status === "failed") {
              addToast(
                `Anreicherung fehlgeschlagen: ${final.lastError ?? "unbekannt"}`,
                "error",
              );
            } else {
              addToast(
                `Anreicherung fertig: ${ok} erfolgreich${errors > 0 ? `, ${errors} Fehler` : ""}`,
                "success",
              );
            }
            if (document.hidden && "Notification" in window && Notification.permission === "granted") {
              new Notification("Anreicherung abgeschlossen", {
                body: `${ok} Lead(s) bereit${errors > 0 ? `, ${errors} Fehler` : ""}`,
              });
            }
          }
        }

        previousIds.current = newIds;
        initialized.current = true;
        setJobs(data.jobs);
      } catch {
        // Netz-Wackler — nächster Tick probiert es erneut.
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    }

    timer = setTimeout(tick, 0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [addToast]);

  if (jobs.length === 0) return null;

  const totalAll = jobs.reduce((s, j) => s + j.total, 0);
  const processedAll = jobs.reduce((s, j) => s + j.processed, 0);
  const currentName = jobs[0]?.currentLeadName ?? null;

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
      title={
        currentName
          ? `Anreicherung läuft: ${currentName}`
          : "Anreicherung läuft im Hintergrund"
      }
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <span>
        Anreicherung: {processedAll}/{totalAll}
      </span>
      {currentName && (
        <span className="hidden max-w-[200px] truncate text-gray-500 dark:text-gray-400 md:inline">
          · {currentName}
        </span>
      )}
    </div>
  );
}
