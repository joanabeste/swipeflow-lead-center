"use client";

import { useRef, useTransition } from "react";
import { CalendarDays, Loader2 } from "lucide-react";
import { updateProject } from "../../actions";
import { useToastContext } from "../../../toast-provider";
import { formatDateDe } from "@/lib/zeit/format";

export function ProjectStartCell({
  projectId,
  initial,
}: {
  projectId: string;
  initial: string | null;
}) {
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function change(next: string) {
    const value = next || null;
    if (value === initial) return;
    startTransition(async () => {
      const res = await updateProject(projectId, { started_at: value });
      if ("error" in res) addToast(res.error, "error");
      else addToast(value ? `Start: ${formatDateDe(value)}` : "Startdatum entfernt.", "success");
    });
  }

  return (
    <button
      type="button"
      aria-label="Startdatum ändern"
      disabled={pending}
      onClick={() => {
        const el = inputRef.current;
        if (!el) return;
        if (typeof el.showPicker === "function") el.showPicker();
        else el.focus();
      }}
      className="relative inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-0.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
    >
      <span>{initial ? formatDateDe(initial) : "Start setzen"}</span>
      <CalendarDays className="h-3 w-3 opacity-50" />
      {pending && <Loader2 className="h-3 w-3 animate-spin" />}
      <input
        ref={inputRef}
        type="date"
        tabIndex={-1}
        aria-hidden
        disabled={pending}
        defaultValue={initial ?? ""}
        onChange={(e) => change(e.target.value)}
        className="pointer-events-none absolute inset-0 h-0 w-0 opacity-0"
      />
    </button>
  );
}
