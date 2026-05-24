"use client";

// Debounced auto-save hook mit zentralisiertem Save-State.
//
// Nutzung:
//   const { state, lastSavedAt, schedule } = useAutosave(800);
//   schedule(async () => { await updateLesson({ id, title }); });
//
// state: "idle" | "dirty" | "saving" | "saved" | "error"

import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export interface AutosaveResult {
  state: AutosaveState;
  lastSavedAt: number | null;
  error: string | null;
  schedule: (fn: () => Promise<{ error?: string } | void | undefined>) => void;
  /** Sofort speichern (z.B. vor unload). */
  flush: () => Promise<void>;
  /** Manuell zuruecksetzen (z.B. nach erfolgreichem Reload). */
  reset: () => void;
}

export function useAutosave(delayMs = 800): AutosaveResult {
  const [state, setState] = useState<AutosaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queuedRef = useRef<(() => Promise<{ error?: string } | void | undefined>) | null>(null);

  const runQueued = useCallback(async () => {
    const fn = queuedRef.current;
    if (!fn) return;
    queuedRef.current = null;
    setState("saving");
    try {
      const res = await fn();
      if (res && typeof res === "object" && "error" in res && res.error) {
        setError(res.error);
        setState("error");
        return;
      }
      setError(null);
      setLastSavedAt(Date.now());
      setState("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
      setState("error");
    }
  }, []);

  const schedule = useCallback(
    (fn: () => Promise<{ error?: string } | void | undefined>) => {
      queuedRef.current = fn;
      setState("dirty");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void runQueued();
      }, delayMs);
    },
    [delayMs, runQueued],
  );

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await runQueued();
  }, [runQueued]);

  const reset = useCallback(() => {
    setState("idle");
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // "Saved"-State nach 2 s zurueck auf "idle" — entlastet die UI.
  useEffect(() => {
    if (state !== "saved") return;
    const t = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(t);
  }, [state]);

  return { state, lastSavedAt, error, schedule, flush, reset };
}
