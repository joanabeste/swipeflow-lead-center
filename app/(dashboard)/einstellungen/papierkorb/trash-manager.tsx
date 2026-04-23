"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Banknote, RotateCcw, Trash2, Clock } from "lucide-react";
import { formatAmount } from "@/lib/deals/types";
import { useToastContext } from "../../toast-provider";
import {
  restoreLead, restoreDeal, purgeLead, purgeDeal,
  type TrashedLead, type TrashedDeal,
} from "./actions";

interface Props {
  leads: TrashedLead[];
  deals: TrashedDeal[];
}

type Tab = "leads" | "deals";

export function TrashManager({ leads, deals }: Props) {
  const [tab, setTab] = useState<Tab>(leads.length >= deals.length ? "leads" : "deals");
  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-md border border-gray-200 p-0.5 dark:border-[#2c2c2e]">
        <TabButton
          active={tab === "leads"}
          onClick={() => setTab("leads")}
          icon={<Building2 className="h-3.5 w-3.5" />}
          label={`Firmen (${leads.length})`}
        />
        <TabButton
          active={tab === "deals"}
          onClick={() => setTab("deals")}
          icon={<Banknote className="h-3.5 w-3.5" />}
          label={`Deals (${deals.length})`}
        />
      </div>

      {tab === "leads" ? <LeadsList leads={leads} /> : <DealsList deals={deals} />}
    </div>
  );
}

function TabButton({
  active, onClick, icon, label,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
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

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-400 dark:border-[#2c2c2e]">
      {label}
    </div>
  );
}

function CountdownBadge({ expiresAt }: { expiresAt: string }) {
  const daysLeft = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400_000));
  const tone =
    daysLeft <= 3
      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
      : daysLeft <= 7
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
        : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${tone}`}>
      <Clock className="h-3 w-3" />
      noch {daysLeft} {daysLeft === 1 ? "Tag" : "Tage"}
    </span>
  );
}

function LeadsList({ leads }: { leads: TrashedLead[] }) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (leads.length === 0) return <EmptyState label="Keine gelöschten Firmen." />;

  function handleRestore(id: string) {
    setPendingId(id);
    startTransition(async () => {
      const res = await restoreLead(id);
      setPendingId(null);
      if ("error" in res) addToast(res.error, "error");
      else {
        addToast("Firma wiederhergestellt.", "success");
        router.refresh();
      }
    });
  }

  function handlePurge(id: string, name: string) {
    if (!confirm(`„${name}" endgültig löschen? Das kann nicht rückgängig gemacht werden.`)) return;
    setPendingId(id);
    startTransition(async () => {
      const res = await purgeLead(id);
      setPendingId(null);
      if ("error" in res) addToast(res.error, "error");
      else {
        addToast("Firma endgültig gelöscht.", "success");
        router.refresh();
      }
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-[#2c2c2e] dark:text-gray-400">
            <th className="px-4 py-2.5">Firma</th>
            <th className="px-4 py-2.5">Gelöscht am</th>
            <th className="px-4 py-2.5">Verbleibend</th>
            <th className="px-4 py-2.5 text-right">Aktion</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id} className="border-b border-gray-100 last:border-b-0 dark:border-[#2c2c2e]">
              <td className="px-4 py-2">
                <div className="flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5 text-gray-400" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.company_name}</p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {[l.domain, l.city].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
                {new Date(l.deleted_at).toLocaleString("de-DE")}
              </td>
              <td className="px-4 py-2">
                <CountdownBadge expiresAt={l.expires_at} />
              </td>
              <td className="px-4 py-2">
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => handleRestore(l.id)}
                    disabled={pendingId === l.id}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50 dark:border-[#2c2c2e] dark:bg-[#232325] dark:hover:bg-white/5"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Wiederherstellen
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePurge(l.id, l.company_name)}
                    disabled={pendingId === l.id}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-3 w-3" />
                    Endgültig
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DealsList({ deals }: { deals: TrashedDeal[] }) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (deals.length === 0) return <EmptyState label="Keine gelöschten Deals." />;

  function handleRestore(id: string) {
    setPendingId(id);
    startTransition(async () => {
      const res = await restoreDeal(id);
      setPendingId(null);
      if ("error" in res) addToast(res.error, "error");
      else {
        addToast("Deal wiederhergestellt.", "success");
        router.refresh();
      }
    });
  }

  function handlePurge(id: string, title: string) {
    if (!confirm(`Deal „${title}" endgültig löschen? Das kann nicht rückgängig gemacht werden.`)) return;
    setPendingId(id);
    startTransition(async () => {
      const res = await purgeDeal(id);
      setPendingId(null);
      if ("error" in res) addToast(res.error, "error");
      else {
        addToast("Deal endgültig gelöscht.", "success");
        router.refresh();
      }
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-[#2c2c2e] dark:text-gray-400">
            <th className="px-4 py-2.5">Deal / Firma</th>
            <th className="px-4 py-2.5 text-right">Volumen</th>
            <th className="px-4 py-2.5">Stage</th>
            <th className="px-4 py-2.5">Gelöscht am</th>
            <th className="px-4 py-2.5">Verbleibend</th>
            <th className="px-4 py-2.5 text-right">Aktion</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((d) => (
            <tr key={d.id} className="border-b border-gray-100 last:border-b-0 dark:border-[#2c2c2e]">
              <td className="px-4 py-2">
                <div className="flex items-center gap-2">
                  <Banknote className="h-3.5 w-3.5 text-gray-400" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{d.title}</p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">{d.company_name}</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-2 text-right font-medium text-primary">
                {formatAmount(d.amount_cents, d.currency)}
              </td>
              <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
                {d.stage_label ?? "—"}
              </td>
              <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
                {new Date(d.deleted_at).toLocaleString("de-DE")}
              </td>
              <td className="px-4 py-2">
                <CountdownBadge expiresAt={d.expires_at} />
              </td>
              <td className="px-4 py-2">
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => handleRestore(d.id)}
                    disabled={pendingId === d.id}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50 dark:border-[#2c2c2e] dark:bg-[#232325] dark:hover:bg-white/5"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Wiederherstellen
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePurge(d.id, d.title)}
                    disabled={pendingId === d.id}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-3 w-3" />
                    Endgültig
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
