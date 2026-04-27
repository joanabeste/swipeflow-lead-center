"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, RotateCcw, Briefcase, Globe } from "lucide-react";
import { useToastContext } from "../../toast-provider";
import { restoreArchivedLead, type ArchivedLead } from "./actions";

interface Props {
  leads: ArchivedLead[];
}

type Filter = "all" | "recruiting" | "webdesign";

export function ArchiveManager({ leads }: Props) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [filter, setFilter] = useState<Filter>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startRow] = useTransition();

  const counts = useMemo(() => {
    const recruiting = leads.filter((l) => l.vertical === "recruiting").length;
    const webdesign = leads.filter((l) => l.vertical === "webdesign").length;
    return { all: leads.length, recruiting, webdesign };
  }, [leads]);

  const filtered = useMemo(() => {
    if (filter === "all") return leads;
    return leads.filter((l) => l.vertical === filter);
  }, [leads, filter]);

  function handleRestore(id: string, name: string) {
    setPendingId(id);
    startRow(async () => {
      const res = await restoreArchivedLead(id);
      setPendingId(null);
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      addToast(
        res.restoredTo
          ? `„${name}" wieder zur „Manuellen Überprüfung" verschoben.`
          : `„${name}" wieder unter „Neue Leads" sichtbar.`,
        "success",
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-md border border-gray-200 p-0.5 dark:border-[#2c2c2e]">
        <TabButton active={filter === "all"} onClick={() => setFilter("all")} label={`Alle (${counts.all})`} />
        <TabButton
          active={filter === "recruiting"}
          onClick={() => setFilter("recruiting")}
          icon={<Briefcase className="h-3.5 w-3.5" />}
          label={`Recruiting (${counts.recruiting})`}
        />
        <TabButton
          active={filter === "webdesign"}
          onClick={() => setFilter("webdesign")}
          icon={<Globe className="h-3.5 w-3.5" />}
          label={`Webdesign (${counts.webdesign})`}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-400 dark:border-[#2c2c2e]">
          Keine aussortierten Leads in dieser Ansicht.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-[#2c2c2e] dark:text-gray-400">
                <th className="px-4 py-2.5">Firma</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Aussortiert am</th>
                <th className="px-4 py-2.5 text-right">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-b border-gray-100 last:border-b-0 dark:border-[#2c2c2e]">
                  <td className="px-4 py-2">
                    <Link
                      href={`/leads/${l.id}?from=${encodeURIComponent("from=einstellungen/aussortierte-leads")}`}
                      className="flex items-center gap-2 hover:text-primary"
                    >
                      <Building2 className="h-3.5 w-3.5 text-gray-400" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{l.company_name}</p>
                        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                          {[l.domain, l.city].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: `${l.crm_status_color}20`, color: l.crm_status_color }}
                    >
                      {l.crm_status_label}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
                    {new Date(l.updated_at).toLocaleString("de-DE")}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => handleRestore(l.id, l.company_name)}
                        disabled={pendingId === l.id}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50 dark:border-[#2c2c2e] dark:bg-[#232325] dark:hover:bg-white/5"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Wiederherstellen
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TabButton({
  active, onClick, icon, label,
}: { active: boolean; onClick: () => void; icon?: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium ${
        active ? "bg-gray-200 dark:bg-white/10" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
