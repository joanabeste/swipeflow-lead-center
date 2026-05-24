"use client";

import { useEffect, useState, useTransition } from "react";
import { Play, Square, Clock } from "lucide-react";
import { useToastContext } from "../../toast-provider";
import { startTimer, stopTimer } from "../actions";
import { formatDuration } from "@/lib/zeit/format";

interface Props {
  running: { id: string; started_at: string; note: string | null } | null;
}

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export function TimerBar({ running }: Props) {
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  const [pauseToastShown, setPauseToastShown] = useState(false);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    if (!running) {
      setPauseToastShown(false);
      return;
    }
    const elapsed = now - new Date(running.started_at).getTime();
    if (elapsed >= SIX_HOURS_MS && !pauseToastShown) {
      addToast("Du arbeitest seit ueber 6 Stunden — Zeit fuer eine Pause (§4 ArbZG).", "info", { durationMs: 10000 });
      setPauseToastShown(true);
    }
  }, [now, running, pauseToastShown, addToast]);

  const elapsed = running ? Math.max(0, Math.floor((now - new Date(running.started_at).getTime()) / 1000)) : 0;

  function handleStart() {
    startTransition(async () => {
      const res = await startTimer(null);
      if ("error" in res) addToast(res.error, "error");
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

  if (running) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-primary/10 px-3 py-1.5 text-sm">
        <span className="flex items-center gap-1.5 text-primary">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          <Clock className="h-4 w-4" />
        </span>
        <span className="font-mono text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
          {formatDuration(elapsed)}
        </span>
        {running.note && <span className="hidden max-w-[200px] truncate text-xs text-gray-500 sm:inline">{running.note}</span>}
        <button onClick={handleStop} disabled={pending} className="rounded-md bg-red-500 px-2 py-1 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50">
          <Square className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button onClick={handleStart} disabled={pending} className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-[#2c2c2e]/60 dark:text-gray-300 dark:hover:bg-white/5">
      <Play className="h-3.5 w-3.5" /> Timer
    </button>
  );
}
