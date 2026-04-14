"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PhoneCall } from "lucide-react";
import type { CustomLeadStatus } from "@/lib/types";
import { updateCrmStatus } from "../actions";

export function CrmStatusHeader({
  leadId,
  currentStatusId,
  statuses,
}: {
  leadId: string;
  currentStatusId: string | null;
  statuses: CustomLeadStatus[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const active = statuses.filter((s) => s.is_active);
  const current = statuses.find((s) => s.id === currentStatusId);

  function handleChange(statusId: string) {
    startTransition(async () => {
      await updateCrmStatus(leadId, statusId || null);
      router.refresh();
    });
  }

  return (
    <label className="inline-flex items-center gap-1.5 text-xs">
      <PhoneCall className="h-3.5 w-3.5 text-gray-400" />
      <span className="text-gray-500 dark:text-gray-400">CRM:</span>
      <select
        value={currentStatusId ?? ""}
        onChange={(e) => handleChange(e.target.value)}
        disabled={pending}
        className="rounded-full border-0 px-2.5 py-1 text-xs font-medium focus:ring-2 focus:ring-primary focus:outline-none"
        style={
          current
            ? { backgroundColor: `${current.color}20`, color: current.color }
            : { backgroundColor: "#f3f4f6", color: "#6b7280" }
        }
      >
        <option value="">—</option>
        {active.map((s) => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>
    </label>
  );
}
