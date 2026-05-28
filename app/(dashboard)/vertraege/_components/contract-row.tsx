"use client";

import { useRouter } from "next/navigation";
import { formatEuro } from "@/lib/contracts/format";
import { isExpired, type ContractStatus, type ContractType } from "@/lib/contracts/types";
import { StatusBadge } from "./status-badge";

export interface ContractRowItem {
  id: string;
  type: ContractType;
  status: ContractStatus;
  setup_price_cents: number;
  monthly_maint_cents: number;
  sent_at: string | null;
  signed_at: string | null;
  expires_at: string | null;
  company_name: string | null;
}

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("de-DE") : "—";
}

export function ContractRow({ c }: { c: ContractRowItem }) {
  const router = useRouter();
  const href = `/vertraege/${c.id}`;
  const expired = isExpired({ expires_at: c.expires_at, status: c.status });

  return (
    <tr
      onClick={() => router.push(href)}
      className="cursor-pointer transition hover:bg-gray-50 dark:hover:bg-white/5"
    >
      <td className="px-4 py-3">
        <span className="font-medium text-gray-900 dark:text-white">{c.company_name || "Unbenannter Kunde"}</span>
        <span className="ml-2 text-[11px] uppercase text-gray-400">{c.type}</span>
      </td>
      <td className="px-4 py-3 tabular-nums text-gray-700 dark:text-gray-200">{formatEuro(c.setup_price_cents)}</td>
      <td className="px-4 py-3 tabular-nums text-gray-700 dark:text-gray-200">{formatEuro(c.monthly_maint_cents)}</td>
      <td className="px-4 py-3"><StatusBadge status={c.status} expired={expired} emailed={!!c.sent_at} /></td>
      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{fmtDate(c.sent_at)}</td>
      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{fmtDate(c.signed_at)}</td>
    </tr>
  );
}
