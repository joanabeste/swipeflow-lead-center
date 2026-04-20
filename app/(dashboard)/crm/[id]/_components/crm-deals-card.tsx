"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Target } from "lucide-react";
import type { DealStage, DealWithRelations } from "@/lib/deals/types";
import { formatAmount } from "@/lib/deals/types";
import { NewDealDialog } from "../../../deals/new-deal-dialog";
import { Card } from "./crm-shared";

export function CrmDealsCard({
  leadId,
  companyName,
  deals,
  stages,
  team,
}: {
  leadId: string;
  companyName: string;
  deals: DealWithRelations[];
  stages: DealStage[];
  team: { id: string; name: string; avatarUrl: string | null }[];
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          <Target className="h-3.5 w-3.5" />
          Deals ({deals.length})
        </h2>
        <button
          onClick={() => setDialogOpen(true)}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5 dark:hover:text-gray-200"
          title="Deal anlegen"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {deals.length === 0 ? (
        <p className="mt-2 text-sm text-gray-400">Keine Deals für diese Firma.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {deals.map((d) => (
            <li key={d.id}>
              <Link
                href={`/deals/${d.id}`}
                className="block rounded-md border border-gray-100 p-2 transition hover:border-primary dark:border-[#2c2c2e] dark:hover:border-primary"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-medium" title={d.title}>{d.title}</p>
                  <span
                    className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ backgroundColor: `${d.stage_color}20`, color: d.stage_color }}
                  >
                    {d.stage_label}
                  </span>
                </div>
                <p className="mt-0.5 text-sm font-semibold text-primary">
                  {formatAmount(d.amountCents, d.currency)}
                </p>
                {d.assignee_name && (
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {d.assignee_name}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {dialogOpen && (
        <NewDealDialog
          stages={stages.filter((s) => s.isActive)}
          team={team}
          preselectedLead={{ id: leadId, company_name: companyName }}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </Card>
  );
}
