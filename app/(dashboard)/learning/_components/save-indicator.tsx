"use client";

import { useEffect, useState } from "react";
import { Check, AlertCircle, Loader2 } from "lucide-react";
import type { AutosaveState } from "../_hooks/use-autosave";

export function SaveIndicator({
  state,
  lastSavedAt,
  error,
}: {
  state: AutosaveState;
  lastSavedAt: number | null;
  error: string | null;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (state !== "idle" || !lastSavedAt) return;
    const t = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, [state, lastSavedAt]);

  if (state === "saving" || state === "dirty") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Speichere…
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
        <Check className="h-3.5 w-3.5" />
        Gespeichert
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400" title={error ?? undefined}>
        <AlertCircle className="h-3.5 w-3.5" />
        Fehler
      </span>
    );
  }
  if (lastSavedAt) {
    return (
      <span className="text-xs text-gray-400 dark:text-gray-500">
        {formatRelative(lastSavedAt)}
      </span>
    );
  }
  return null;
}

function formatRelative(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "gerade eben gespeichert";
  if (diff < 60) return `vor ${diff}s gespeichert`;
  if (diff < 3600) return `vor ${Math.floor(diff / 60)}min gespeichert`;
  return `vor ${Math.floor(diff / 3600)}h gespeichert`;
}
