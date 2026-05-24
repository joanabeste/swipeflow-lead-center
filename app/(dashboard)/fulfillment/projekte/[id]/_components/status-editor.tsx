"use client";

import { useTransition } from "react";
import { updateProject } from "../../../actions";
import type { ProjectStatus } from "@/lib/fulfillment/types";
import { PROJECT_STATUS_LABELS } from "@/lib/fulfillment/types";
import { useToastContext } from "../../../../toast-provider";

export function ProjectStatusEditor({ projectId, current }: { projectId: string; current: ProjectStatus }) {
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();

  function change(next: ProjectStatus) {
    if (next === current) return;
    startTransition(async () => {
      const res = await updateProject(projectId, { status: next });
      if ("error" in res) addToast(res.error, "error");
      else addToast(`Status: ${PROJECT_STATUS_LABELS[next]}`, "success");
    });
  }

  return (
    <select
      disabled={pending}
      value={current}
      onChange={(e) => change(e.target.value as ProjectStatus)}
      className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e] dark:text-gray-100"
    >
      <option value="onboarding">{PROJECT_STATUS_LABELS.onboarding}</option>
      <option value="active">{PROJECT_STATUS_LABELS.active}</option>
      <option value="paused">{PROJECT_STATUS_LABELS.paused}</option>
      <option value="completed">{PROJECT_STATUS_LABELS.completed}</option>
    </select>
  );
}
