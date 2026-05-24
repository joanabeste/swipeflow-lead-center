"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { deleteCustomer } from "../actions";
import { useToastContext } from "../../../toast-provider";
import { formatDateDe } from "@/lib/zeit/format";
import { PROJECT_STATUS_COLORS, PROJECT_STATUS_LABELS, type ProjectStatus } from "@/lib/fulfillment/types";

export type CustomerRow = {
  id: string;
  company_name: string;
  became_customer_at: string | null;
  active_project: { id: string; name: string; status: string } | null;
};

export function CustomersTable({ rows }: { rows: CustomerRow[] }) {
  const { addToast } = useToastContext();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function onDelete(id: string, name: string) {
    setPendingId(id);
    startTransition(async () => {
      const res = await deleteCustomer(id);
      setPendingId(null);
      setConfirmId(null);
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      addToast(`Kunde „${name}" gelöscht.`, "success");
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 dark:bg-[#1c1c1e]">
          <tr>
            <th className="px-4 py-3 text-left">Firma</th>
            <th className="px-4 py-3 text-left">Aktives Projekt</th>
            <th className="px-4 py-3 text-left">Kunde seit</th>
            <th className="w-10 px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-[#2c2c2e]/40">
          {rows.map((c) => {
            const ap = c.active_project;
            const apStatus = ap?.status as ProjectStatus | undefined;
            return (
              <tr key={c.id} className="group hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                <td className="px-4 py-3">
                  <Link href={`/fulfillment/kunden/${c.id}`} className="font-medium text-gray-900 hover:text-primary dark:text-white">
                    {c.company_name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {ap && apStatus ? (
                    <Link
                      href={`/fulfillment/projekte/${ap.id}`}
                      className="inline-flex items-center gap-2 group/proj"
                      title={ap.name}
                    >
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PROJECT_STATUS_COLORS[apStatus] ?? "bg-gray-200 text-gray-700"}`}>
                        {PROJECT_STATUS_LABELS[apStatus] ?? ap.status}
                      </span>
                      <span className="max-w-[180px] truncate text-xs text-gray-600 group-hover/proj:text-primary dark:text-gray-300">
                        {ap.name}
                      </span>
                    </Link>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c.became_customer_at ? formatDateDe(c.became_customer_at) : "—"}</td>
                <td className="px-4 py-3 text-right">
                  {confirmId === c.id ? (
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onDelete(c.id, c.company_name)}
                        disabled={pendingId === c.id}
                        className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {pendingId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Löschen"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmId(null)}
                        disabled={pendingId === c.id}
                        className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"
                      >
                        Abbrechen
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmId(c.id)}
                      aria-label={`Kunde ${c.company_name} löschen`}
                      title="Kunde löschen"
                      className="rounded p-1 text-gray-400 opacity-50 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
