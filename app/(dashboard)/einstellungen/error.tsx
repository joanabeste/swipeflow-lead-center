"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function EinstellungenError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[einstellungen-error]", error);
  }, [error]);

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-900/50 dark:bg-red-900/20">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-red-900 dark:text-red-200">
            Einstellung konnte nicht geladen werden
          </h2>
          <p className="mt-1 text-sm text-red-800/80 dark:text-red-300/80">
            {error.message || "Ein unerwarteter Fehler ist aufgetreten."}
          </p>
          {error.digest && (
            <p className="mt-2 font-mono text-[10px] text-red-700/60 dark:text-red-400/60">
              Digest: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-700"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Nochmal versuchen
          </button>
        </div>
      </div>
    </div>
  );
}
