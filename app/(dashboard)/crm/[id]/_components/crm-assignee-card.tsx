"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserCheck } from "lucide-react";
import { Card } from "./crm-shared";
import { updateLeadAssignedTo } from "../../actions";

export function CrmAssigneeCard({
  leadId,
  assignedTo,
  team,
}: {
  leadId: string;
  assignedTo: string | null;
  team: { id: string; name: string; avatarUrl: string | null }[];
}) {
  const [value, setValue] = useState<string>(assignedTo ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function save(next: string) {
    setValue(next);
    setError(null);
    startTransition(async () => {
      const res = await updateLeadAssignedTo(leadId, next || null);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <Card>
      <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        <UserCheck className="h-3.5 w-3.5" />
        Zuständig
      </h2>
      <p className="mt-1 text-[11px] text-gray-400">
        Bekommt die Provision, wenn der Lead einen entsprechenden Status erreicht.
      </p>
      <select
        value={value}
        onChange={(e) => save(e.target.value)}
        disabled={pending}
        className="mt-2 block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none disabled:opacity-50 dark:border-[#2c2c2e] dark:bg-[#232325]"
      >
        <option value="">— niemand —</option>
        {team.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </Card>
  );
}
