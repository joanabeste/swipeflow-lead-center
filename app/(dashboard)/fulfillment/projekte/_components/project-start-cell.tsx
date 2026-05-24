"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
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
    <span className="relative inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5">
      <span>{initial ? formatDateDe(initial) : "—"}</span>
      {pending && <Loader2 className="h-3 w-3 animate-spin" />}
      <input
        type="date"
        aria-label="Startdatum ändern"
        disabled={pending}
        defaultValue={initial ?? ""}
        onChange={(e) => change(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </span>
  );
}
