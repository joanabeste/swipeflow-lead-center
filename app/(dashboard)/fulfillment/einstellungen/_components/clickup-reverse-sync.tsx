"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderInput, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { syncClickupFulfillmentSpace, type ClickupSyncReport } from "../actions";
import { useToastContext } from "../../../toast-provider";

export function ClickupReverseSync() {
  const { addToast } = useToastContext();
  const router = useRouter();
  const [spaceName, setSpaceName] = useState("Fulfillment");
  const [pending, startTransition] = useTransition();
  const [report, setReport] = useState<ClickupSyncReport | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  function start() {
    setReport(null);
    setShowDetails(false);
    startTransition(async () => {
      const res = await syncClickupFulfillmentSpace(spaceName);
      if ("error" in res) {
        addToast(res.error, "error");
      } else {
        setReport(res.data);
        const created = res.data.customersCreated + res.data.projectsCreated;
        addToast(
          created > 0
            ? `Sync OK: ${res.data.customersCreated} Kunden + ${res.data.projectsCreated} Projekte neu, ${res.data.tasksSynced} Tasks gepullt.`
            : `Sync OK: keine neuen Folders, ${res.data.tasksSynced} Tasks aktualisiert.`,
          "success",
        );
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[180px]">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            ClickUp-Space
          </label>
          <input
            value={spaceName}
            onChange={(e) => setSpaceName(e.target.value)}
            placeholder="Fulfillment"
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]"
          />
        </div>
        <button
          type="button"
          onClick={start}
          disabled={pending || !spaceName.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-primary-dark disabled:opacity-50"
        >
          <FolderInput className="h-3.5 w-3.5" />
          {pending ? "Importiere…" : "Folders importieren"}
        </button>
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        Jeder Folder im Space wird ein Kunde + Projekt. Bestehende werden via Folder-ID erkannt und nur die Tasks neu gepullt — keine Duplikate.
      </p>

      {report && (
        <div className="mt-4 space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <Pill label="Folders gescannt" value={report.foldersScanned} />
            <Pill label="Kunden neu" value={report.customersCreated} />
            <Pill label="Kunden wiederverwendet" value={report.customersReused} />
            <Pill label="Projekte neu" value={report.projectsCreated} />
            <Pill label="Projekte schon da" value={report.projectsExisting} />
            <Pill label="Tasks gepullt" value={report.tasksSynced} />
            {report.skipped.length > 0 && <Pill label="Übersprungen" value={report.skipped.length} tone="amber" />}
            {report.errors.length > 0 && <Pill label="Fehler" value={report.errors.length} tone="red" />}
          </div>

          {(report.skipped.length > 0 || report.errors.length > 0) && (
            <button
              type="button"
              onClick={() => setShowDetails((s) => !s)}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              {showDetails ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Details
            </button>
          )}

          {showDetails && (
            <div className="space-y-2 text-xs">
              {report.errors.length > 0 && (
                <div>
                  <p className="font-semibold text-red-600 dark:text-red-400">Fehler:</p>
                  <ul className="mt-1 space-y-0.5">
                    {report.errors.map((e, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-red-700 dark:text-red-300">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        <span><strong>{e.folder}:</strong> {e.error}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {report.skipped.length > 0 && (
                <div>
                  <p className="font-semibold text-amber-700 dark:text-amber-400">Übersprungen:</p>
                  <ul className="mt-1 space-y-0.5">
                    {report.skipped.map((s, i) => (
                      <li key={i} className="text-amber-700 dark:text-amber-300">
                        <strong>{s.folder}:</strong> {s.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Pill({ label, value, tone = "primary" }: { label: string; value: number; tone?: "primary" | "amber" | "red" }) {
  const colors =
    tone === "amber"
      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
      : tone === "red"
      ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
      : "bg-white text-gray-700 dark:bg-[#1c1c1e] dark:text-gray-200";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${colors}`}>
      <span className="text-gray-500 dark:text-gray-400">{label}:</span>
      <strong className="tabular-nums">{value}</strong>
    </span>
  );
}
