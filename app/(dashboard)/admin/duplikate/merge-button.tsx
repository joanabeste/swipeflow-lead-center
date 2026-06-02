"use client";

import { useState, useTransition } from "react";
import { Loader2, GitMerge, Check } from "lucide-react";
import { mergeAllClusters } from "./actions";

export function MergeAllButton({ disabled }: { disabled: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ merged: number; losers: number; errors: number; errorMessage?: string } | null>(null);

  function run() {
    setConfirming(false);
    startTransition(async () => {
      const res = await mergeAllClusters();
      setResult(res);
    });
  }

  if (result) {
    // Alles fehlgeschlagen → roter Fehlerkasten mit echter Meldung (nicht grün,
    // sonst sieht "0 zusammengeführt" wie ein Erfolg aus).
    if (result.merged === 0 && result.errors > 0) {
      return (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          <p className="font-medium">Zusammenführen fehlgeschlagen ({result.errors} Fehler).</p>
          {result.errorMessage && <p className="mt-1 font-mono text-xs">{result.errorMessage}</p>}
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
        <Check className="h-4 w-4" />
        {result.merged} Gruppen zusammengeführt ({result.losers} Duplikate archiviert)
        {result.errors > 0 ? `, ${result.errors} Fehler` : ""}.
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600 dark:text-gray-300">Wirklich alle zusammenführen?</span>
        <button
          onClick={run}
          className="rounded-xl bg-primary px-3.5 py-2 text-sm font-medium text-gray-900 hover:bg-primary/90"
        >
          Ja, zusammenführen
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          Abbrechen
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      disabled={disabled || isPending}
      className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-sm font-medium text-gray-900 hover:bg-primary/90 disabled:opacity-50"
    >
      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}
      Alle zusammenführen
    </button>
  );
}
