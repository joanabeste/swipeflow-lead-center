"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { DealStage, DealWithRelations } from "@/lib/deals/types";
import { formatAmount, isStale } from "@/lib/deals/types";
import type { SortDir, SortKey } from "../_lib/types";

interface Props {
  deals: DealWithRelations[];
  stages: DealStage[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey, defaultDir?: SortDir) => void;
}

export function TableView({ deals, stages, sortKey, sortDir, onSort }: Props) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-[#2c2c2e] dark:text-gray-400">
            <SortTh label="Deal / Firma" k="title" sortKey={sortKey} sortDir={sortDir} onSort={onSort} defaultDir="asc" />
            <SortTh label="Stage" k="stage" sortKey={sortKey} sortDir={sortDir} onSort={onSort} defaultDir="asc" />
            <SortTh label="Volumen" k="amount" sortKey={sortKey} sortDir={sortDir} onSort={onSort} defaultDir="desc" align="right" />
            <SortTh label="Closing-%" k="probability" sortKey={sortKey} sortDir={sortDir} onSort={onSort} defaultDir="desc" align="right" />
            <SortTh label="Zuständig" k="assignee" sortKey={sortKey} sortDir={sortDir} onSort={onSort} defaultDir="asc" />
            <th className="px-3 py-2.5">Nächster Schritt</th>
            <SortTh label="Letzter FollowUp" k="lastFollowup" sortKey={sortKey} sortDir={sortDir} onSort={onSort} defaultDir="desc" />
          </tr>
        </thead>
        <tbody>
          {deals.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                Noch keine Deals.
              </td>
            </tr>
          )}
          {deals.map((d) => (
            <TableRow key={d.id} deal={d} stages={stages} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableRow({ deal: d, stages }: { deal: DealWithRelations; stages: DealStage[] }) {
  const titleMatchesCompany =
    d.title.trim().toLowerCase() === d.company_name.trim().toLowerCase();
  return (
    <tr
      className="cursor-pointer border-b border-gray-100 last:border-b-0 hover:bg-gray-50 dark:border-[#2c2c2e] dark:hover:bg-white/[0.02]"
      onClick={(e) => {
        if (e.target instanceof HTMLAnchorElement) return;
        window.location.href = `/deals/${d.id}`;
      }}
    >
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <Link href={`/deals/${d.id}`} className="font-medium hover:underline">
            {d.title}
          </Link>
          {isStale(d, stages) && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              stale
            </span>
          )}
        </div>
        {!titleMatchesCompany && (
          d.leadId ? (
            <Link
              href={`/crm/${d.leadId}`}
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-gray-500 hover:underline dark:text-gray-400"
            >
              {d.company_name}
            </Link>
          ) : (
            <span className="text-xs text-gray-500 dark:text-gray-400" title="Firma nicht im CRM">
              {d.company_name}
            </span>
          )
        )}
      </td>
      <td className="px-3 py-2">
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: `${d.stage_color}20`, color: d.stage_color }}
        >
          {d.stage_label}
        </span>
      </td>
      <td className="px-3 py-2 text-right font-medium text-primary">
        {formatAmount(d.amountCents, d.currency)}
      </td>
      <td className="px-3 py-2 text-right text-xs text-gray-500 dark:text-gray-400">
        {d.probability != null ? `${d.probability}%` : "—"}
      </td>
      <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
        {d.assignee_name ?? "—"}
      </td>
      <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400" title={d.nextStep ?? undefined}>
        <span className="line-clamp-1">{d.nextStep ?? "—"}</span>
      </td>
      <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
        {d.lastFollowupAt ? new Date(d.lastFollowupAt).toLocaleDateString("de-DE") : "—"}
      </td>
    </tr>
  );
}

function SortTh({
  label, k, sortKey, sortDir, onSort, defaultDir = "desc", align = "left",
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey, defaultDir?: SortDir) => void;
  defaultDir?: SortDir;
  align?: "left" | "right";
}) {
  const active = sortKey === k;
  const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={`px-3 py-2.5 ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => onSort(k, defaultDir)}
        className={`inline-flex items-center gap-1 ${
          align === "right" ? "flex-row-reverse" : ""
        } ${active ? "text-primary" : "hover:text-gray-700 dark:hover:text-gray-200"}`}
      >
        {label}
        <Icon className={`h-3 w-3 ${active ? "opacity-100" : "opacity-40"}`} />
      </button>
    </th>
  );
}
