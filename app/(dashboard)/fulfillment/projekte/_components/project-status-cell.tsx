"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { updateProject } from "../../actions";
import {
  PROJECT_STATUS_COLORS,
  PROJECT_STATUS_LABELS,
  type ProjectStatus,
} from "@/lib/fulfillment/types";
import { useToastContext } from "../../../toast-provider";

const OPTIONS: ProjectStatus[] = ["onboarding", "active", "paused", "completed"];

export function ProjectStatusCell({
  projectId,
  current,
}: {
  projectId: string;
  current: ProjectStatus;
}) {
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();

  function change(next: ProjectStatus) {
    if (next === current || pending) return;
    startTransition(async () => {
      const res = await updateProject(projectId, { status: next });
      if ("error" in res) addToast(res.error, "error");
      else addToast(`Status: ${PROJECT_STATUS_LABELS[next]}`, "success");
    });
  }

  return (
    <span className={`relative inline-flex items-center rounded-full text-[10px] font-semibold uppercase tracking-wider ${PROJECT_STATUS_COLORS[current]}`}>
      <span className="px-2 py-0.5">{PROJECT_STATUS_LABELS[current]}</span>
      {pending && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
      <select
        aria-label="Status ändern"
        disabled={pending}
        value={current}
        onChange={(e) => change(e.target.value as ProjectStatus)}
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-0 cursor-pointer appearance-none bg-transparent text-transparent outline-none"
      >
        {OPTIONS.map((s) => (
          <option key={s} value={s} className="bg-white text-gray-900 dark:bg-[#1c1c1e] dark:text-gray-100">
            {PROJECT_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
    </span>
  );
}
