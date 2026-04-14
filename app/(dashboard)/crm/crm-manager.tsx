"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Filter, StickyNote, PhoneCall } from "lucide-react";
import { CrmStatusBadge } from "./status-badge";
import { updateCrmStatus } from "./actions";
import type { CustomLeadStatus } from "@/lib/types";

export interface CrmLead {
  id: string;
  company_name: string;
  domain: string | null;
  city: string | null;
  industry: string | null;
  company_size: string | null;
  phone: string | null;
  email: string | null;
  crm_status_id: string | null;
  updated_at: string;
  call_count: number;
  last_call_at: string | null;
  note_count: number;
}

export function CrmManager({
  leads,
  statuses,
  selectedStatus,
  query,
}: {
  leads: CrmLead[];
  statuses: CustomLeadStatus[];
  selectedStatus: string | null;
  query: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(query);
  const [pending, startTransition] = useTransition();
  const activeStatuses = statuses.filter((s) => s.is_active);

  function applyFilters(nextStatus: string | null, nextQuery: string) {
    const params = new URLSearchParams();
    if (nextStatus) params.set("status", nextStatus);
    if (nextQuery) params.set("q", nextQuery);
    const qs = params.toString();
    router.push(qs ? `/crm?${qs}` : "/crm");
  }

  function handleStatusChange(leadId: string, statusId: string) {
    startTransition(async () => {
      await updateCrmStatus(leadId, statusId || null);
      router.refresh();
    });
  }

  function formatDate(iso: string | null) {
    if (!iso) return "–";
    return new Date(iso).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Status-Filter-Chips */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => applyFilters(null, search)}
          className={`rounded-full px-3 py-1 text-sm transition ${
            !selectedStatus
              ? "bg-primary text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
          }`}
        >
          Alle ({leads.length})
        </button>
        {activeStatuses.map((s) => {
          const count = leads.filter((l) => l.crm_status_id === s.id).length;
          const active = selectedStatus === s.id;
          return (
            <button
              key={s.id}
              onClick={() => applyFilters(s.id, search)}
              className="rounded-full px-3 py-1 text-sm transition"
              style={
                active
                  ? { backgroundColor: s.color, color: "white" }
                  : { backgroundColor: `${s.color}15`, color: s.color }
              }
            >
              {s.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyFilters(selectedStatus, search);
            }}
            placeholder="Firma, Domain, Stadt …"
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-[#2c2c2e] dark:bg-[#1c1c1e]"
          />
        </div>
        {(selectedStatus || search) && (
          <button
            onClick={() => {
              setSearch("");
              applyFilters(null, "");
            }}
            className="text-xs text-gray-500 hover:underline"
          >
            Filter zurücksetzen
          </button>
        )}
      </div>

      {/* Tabelle */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
        <table className="w-full">
          <thead className="border-b border-gray-100 bg-gray-50/50 dark:border-[#2c2c2e] dark:bg-[#161618]">
            <tr>
              <Th>Firma</Th>
              <Th>Stadt</Th>
              <Th>Branche</Th>
              <Th>Kontakt</Th>
              <Th>CRM-Status</Th>
              <Th className="text-center">
                <PhoneCall className="mx-auto h-4 w-4" />
              </Th>
              <Th className="text-center">
                <StickyNote className="mx-auto h-4 w-4" />
              </Th>
              <Th>Letzter Anruf</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-[#2c2c2e]/50">
            {leads.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-12 text-center text-sm text-gray-400">
                  Noch keine Leads — qualifiziere Leads im Leads-Bereich oder
                  logge einen Anruf, damit ein Lead hier landet.
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <Link
                      href={`/crm/${lead.id}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {lead.company_name}
                    </Link>
                    {lead.domain && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">{lead.domain}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">{lead.city ?? "–"}</td>
                  <td className="px-4 py-3 text-sm">{lead.industry ?? "–"}</td>
                  <td className="px-4 py-3 text-sm">
                    {lead.phone && (
                      <a
                        href={`tel:${lead.phone}`}
                        className="block text-primary hover:underline"
                      >
                        {lead.phone}
                      </a>
                    )}
                    {lead.email && (
                      <a
                        href={`mailto:${lead.email}`}
                        className="block text-xs text-gray-500 hover:underline"
                      >
                        {lead.email}
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={lead.crm_status_id ?? ""}
                      onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                      disabled={pending}
                      className="rounded-md border border-gray-200 bg-transparent px-2 py-1 text-xs dark:border-[#2c2c2e]"
                    >
                      <option value="">—</option>
                      {activeStatuses.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <div className="mt-1">
                      <CrmStatusBadge statusId={lead.crm_status_id} statuses={statuses} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-medium">
                    {lead.call_count > 0 ? lead.call_count : "–"}
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-medium">
                    {lead.note_count > 0 ? lead.note_count : "–"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(lead.last_call_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {leads.length === 500 && (
        <p className="text-xs text-gray-400">
          Nur die 500 aktuellsten Leads werden angezeigt. Nutze Filter/Suche, um einzugrenzen.
        </p>
      )}

      {/* eslint-disable-next-line @typescript-eslint/no-unused-vars */}
      {pending && <Filter className="hidden" />}
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 ${className}`}
    >
      {children}
    </th>
  );
}
