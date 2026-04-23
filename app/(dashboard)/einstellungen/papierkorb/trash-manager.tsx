"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Banknote, RotateCcw, Trash2, Clock, X } from "lucide-react";
import { formatAmount } from "@/lib/deals/types";
import { useToastContext } from "../../toast-provider";
import {
  restoreLead, restoreDeal, purgeLead, purgeDeal,
  bulkRestoreLeads, bulkRestoreDeals, bulkPurgeLeads, bulkPurgeDeals,
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
  // useState mit lazy-Initializer ist der React-gesegnete Escape-Hatch für
  // impure Initialwerte (Date.now darf nicht direkt im Render).
  const [nowMs] = useState(() => Date.now());
  const daysLeft = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - nowMs) / 86400_000));
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

// ─── Gemeinsame Selektions-Hook ───────────────────────────────

function useRowSelection(ids: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastIndex, setLastIndex] = useState<number | null>(null);

  const allSelected = ids.length > 0 && selected.size === ids.length;
  const someSelected = selected.size > 0 && !allSelected;

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(ids));
  }

  function toggleOne(id: string, index: number, e?: React.MouseEvent) {
    const next = new Set(selected);
    // Shift-Klick: Bereich zwischen letztem Klick und aktuellem Klick markieren.
    if (e?.shiftKey && lastIndex !== null) {
      const start = Math.min(lastIndex, index);
      const end = Math.max(lastIndex, index);
      for (let i = start; i <= end; i++) next.add(ids[i]);
      setSelected(next);
      setLastIndex(index);
      return;
    }
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    setLastIndex(index);
  }

  function clear() {
    setSelected(new Set());
    setLastIndex(null);
  }

  return { selected, allSelected, someSelected, toggleAll, toggleOne, clear };
}

// ─── Firmen ───────────────────────────────────────────────────

function LeadsList({ leads }: { leads: TrashedLead[] }) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [bulkPending, startBulk] = useTransition();
  const [, startRow] = useTransition();
  const ids = leads.map((l) => l.id);
  const { selected, allSelected, someSelected, toggleAll, toggleOne, clear } = useRowSelection(ids);

  if (leads.length === 0) return <EmptyState label="Keine gelöschten Firmen." />;

  function handleRestore(id: string) {
    setPendingId(id);
    startRow(async () => {
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
    startRow(async () => {
      const res = await purgeLead(id);
      setPendingId(null);
      if ("error" in res) addToast(res.error, "error");
      else {
        addToast("Firma endgültig gelöscht.", "success");
        router.refresh();
      }
    });
  }

  function handleBulkRestore() {
    const selectedIds = Array.from(selected);
    startBulk(async () => {
      const res = await bulkRestoreLeads(selectedIds);
      if ("error" in res) addToast(res.error, "error");
      else {
        addToast(`${res.count} ${res.count === 1 ? "Firma" : "Firmen"} wiederhergestellt.`, "success");
        clear();
        router.refresh();
      }
    });
  }

  function handleBulkPurge() {
    const selectedIds = Array.from(selected);
    if (!confirm(`${selectedIds.length} ${selectedIds.length === 1 ? "Firma" : "Firmen"} endgültig löschen? Das kann nicht rückgängig gemacht werden.`)) return;
    startBulk(async () => {
      const res = await bulkPurgeLeads(selectedIds);
      if ("error" in res) addToast(res.error, "error");
      else {
        addToast(`${res.count} ${res.count === 1 ? "Firma" : "Firmen"} endgültig gelöscht.`, "success");
        clear();
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <BulkActionBar
          count={selected.size}
          label={`${selected.size} ${selected.size === 1 ? "Firma" : "Firmen"} ausgewählt`}
          pending={bulkPending}
          onRestore={handleBulkRestore}
          onPurge={handleBulkPurge}
          onClear={clear}
        />
      )}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-[#2c2c2e] dark:text-gray-400">
              <th className="w-10 px-4 py-2.5">
                <Checkbox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} />
              </th>
              <th className="px-4 py-2.5">Firma</th>
              <th className="px-4 py-2.5">Gelöscht am</th>
              <th className="px-4 py-2.5">Verbleibend</th>
              <th className="px-4 py-2.5 text-right">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l, i) => {
              const isSelected = selected.has(l.id);
              return (
                <tr
                  key={l.id}
                  className={`border-b border-gray-100 last:border-b-0 dark:border-[#2c2c2e] ${
                    isSelected ? "bg-primary/5" : ""
                  }`}
                >
                  <td className="px-4 py-2">
                    <Checkbox
                      checked={isSelected}
                      onChange={(e) => toggleOne(l.id, i, e as unknown as React.MouseEvent)}
                    />
                  </td>
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
                        disabled={pendingId === l.id || bulkPending}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50 dark:border-[#2c2c2e] dark:bg-[#232325] dark:hover:bg-white/5"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Wiederherstellen
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePurge(l.id, l.company_name)}
                        disabled={pendingId === l.id || bulkPending}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-3 w-3" />
                        Endgültig
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Deals ────────────────────────────────────────────────────

function DealsList({ deals }: { deals: TrashedDeal[] }) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [bulkPending, startBulk] = useTransition();
  const [, startRow] = useTransition();
  const ids = deals.map((d) => d.id);
  const { selected, allSelected, someSelected, toggleAll, toggleOne, clear } = useRowSelection(ids);

  if (deals.length === 0) return <EmptyState label="Keine gelöschten Deals." />;

  function handleRestore(id: string) {
    setPendingId(id);
    startRow(async () => {
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
    startRow(async () => {
      const res = await purgeDeal(id);
      setPendingId(null);
      if ("error" in res) addToast(res.error, "error");
      else {
        addToast("Deal endgültig gelöscht.", "success");
        router.refresh();
      }
    });
  }

  function handleBulkRestore() {
    const selectedIds = Array.from(selected);
    startBulk(async () => {
      const res = await bulkRestoreDeals(selectedIds);
      if ("error" in res) addToast(res.error, "error");
      else {
        addToast(`${res.count} Deal${res.count === 1 ? "" : "s"} wiederhergestellt.`, "success");
        clear();
        router.refresh();
      }
    });
  }

  function handleBulkPurge() {
    const selectedIds = Array.from(selected);
    if (!confirm(`${selectedIds.length} Deal${selectedIds.length === 1 ? "" : "s"} endgültig löschen? Das kann nicht rückgängig gemacht werden.`)) return;
    startBulk(async () => {
      const res = await bulkPurgeDeals(selectedIds);
      if ("error" in res) addToast(res.error, "error");
      else {
        addToast(`${res.count} Deal${res.count === 1 ? "" : "s"} endgültig gelöscht.`, "success");
        clear();
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <BulkActionBar
          count={selected.size}
          label={`${selected.size} Deal${selected.size === 1 ? "" : "s"} ausgewählt`}
          pending={bulkPending}
          onRestore={handleBulkRestore}
          onPurge={handleBulkPurge}
          onClear={clear}
        />
      )}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-[#2c2c2e] dark:text-gray-400">
              <th className="w-10 px-4 py-2.5">
                <Checkbox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} />
              </th>
              <th className="px-4 py-2.5">Deal / Firma</th>
              <th className="px-4 py-2.5 text-right">Volumen</th>
              <th className="px-4 py-2.5">Stage</th>
              <th className="px-4 py-2.5">Gelöscht am</th>
              <th className="px-4 py-2.5">Verbleibend</th>
              <th className="px-4 py-2.5 text-right">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((d, i) => {
              const isSelected = selected.has(d.id);
              return (
                <tr
                  key={d.id}
                  className={`border-b border-gray-100 last:border-b-0 dark:border-[#2c2c2e] ${
                    isSelected ? "bg-primary/5" : ""
                  }`}
                >
                  <td className="px-4 py-2">
                    <Checkbox
                      checked={isSelected}
                      onChange={(e) => toggleOne(d.id, i, e as unknown as React.MouseEvent)}
                    />
                  </td>
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
                        disabled={pendingId === d.id || bulkPending}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50 dark:border-[#2c2c2e] dark:bg-[#232325] dark:hover:bg-white/5"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Wiederherstellen
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePurge(d.id, d.title)}
                        disabled={pendingId === d.id || bulkPending}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-3 w-3" />
                        Endgültig
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Shared UI-Bausteine ──────────────────────────────────────

function Checkbox({
  checked, indeterminate, onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement> | React.MouseEvent) => void;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = !!indeterminate;
      }}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e)}
      className="h-4 w-4 cursor-pointer rounded border-gray-300 text-primary focus:ring-1 focus:ring-primary"
    />
  );
}

function BulkActionBar({
  label, pending, onRestore, onPurge, onClear,
}: {
  count: number;
  label: string;
  pending: boolean;
  onRestore: () => void;
  onPurge: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm dark:border-primary/40 dark:bg-primary/10">
      <span className="font-medium">{label}</span>
      <button
        type="button"
        onClick={onRestore}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-50 dark:border-[#2c2c2e] dark:bg-[#232325] dark:hover:bg-white/5"
      >
        <RotateCcw className="h-3 w-3" />
        Alle wiederherstellen
      </button>
      <button
        type="button"
        onClick={onPurge}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/40 dark:bg-[#232325] dark:hover:bg-red-900/20"
      >
        <Trash2 className="h-3 w-3" />
        Alle endgültig löschen
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={pending}
        className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-white/5"
      >
        <X className="h-3 w-3" />
        Auswahl aufheben
      </button>
    </div>
  );
}

export { };
