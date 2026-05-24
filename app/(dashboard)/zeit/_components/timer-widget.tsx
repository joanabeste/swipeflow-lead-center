"use client";

import { useEffect, useState, useTransition } from "react";
import { Play, Square } from "lucide-react";
import { useToastContext } from "../../toast-provider";
import { startTimer, stopTimer } from "../actions";
import { formatDuration } from "@/lib/zeit/format";

interface Props {
  running: { id: string; started_at: string; note: string | null } | null;
}

export function TimerWidget({ running }: Props) {
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState(running?.note ?? "");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const elapsed = running ? Math.max(0, Math.floor((now - new Date(running.started_at).getTime()) / 1000)) : 0;

  function handleStart() {
    startTransition(async () => {
      const res = await startTimer(note || null);
      if ("error" in res) addToast(res.error, "error");
      else addToast("Timer gestartet.", "success");
    });
  }

  function handleStop() {
    if (!running) return;
    startTransition(async () => {
      const res = await stopTimer(running.id);
      if ("error" in res) addToast(res.error, "error");
      else addToast("Timer gestoppt.", "success");
    });
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-gray-400 dark:text-gray-500">
            {running ? "Aktueller Timer" : "Kein Timer aktiv"}
          </p>
          <p className="mt-1 font-mono text-4xl font-semibold tabular-nums text-gray-900 dark:text-white">
            {formatDuration(elapsed)}
          </p>
        </div>
        {running ? (
          <button
            type="button"
            onClick={handleStop}
            disabled={pending}
            className="flex items-center gap-2 rounded-xl bg-red-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-600 disabled:opacity-50"
          >
            <Square className="h-4 w-4" />
            Stoppen
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStart}
            disabled={pending}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-primary-dark disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            Starten
          </button>
        )}
      </div>

      <div className="mt-4">
        <label className="block text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Notiz (optional)
        </label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Woran arbeitest du gerade?"
          disabled={!!running || pending}
          className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none disabled:opacity-60 dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e] dark:text-gray-100"
        />
      </div>
    </div>
  );
}
