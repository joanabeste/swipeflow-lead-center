"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar, FileDown, LayoutGrid, List, Loader2, Plus, Search, X } from "lucide-react";
import type { DealStage } from "@/lib/deals/types";
import type { StageGroupFilter, ViewMode } from "../_lib/types";
import { useToastContext } from "../../toast-provider";

interface Props {
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  search: string;
  onSearchChange: (v: string) => void;
  stageGroup: StageGroupFilter;
  onStageGroupChange: (v: StageGroupFilter) => void;
  stageId: string;
  onStageIdChange: (v: string) => void;
  assigneeId: string;
  onAssigneeChange: (v: string) => void;
  stages: DealStage[];
  team: { id: string; name: string }[];
  totalCount: number;
  shownCount: number;
  hasActiveFilter: boolean;
  onReset: () => void;
  onCreateClick: () => void;
}

export function DealsToolbar({
  view, onViewChange,
  search, onSearchChange,
  stageGroup, onStageGroupChange,
  stageId, onStageIdChange,
  assigneeId, onAssigneeChange,
  stages, team,
  totalCount, shownCount, hasActiveFilter, onReset,
  onCreateClick,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
      <div className="flex rounded-md border border-gray-200 p-0.5 dark:border-[#2c2c2e]">
        <ViewToggleButton active={view === "table"} onClick={() => onViewChange("table")} icon={<List className="h-3.5 w-3.5" />} label="Tabelle" />
        <ViewToggleButton active={view === "kanban"} onClick={() => onViewChange("kanban")} icon={<LayoutGrid className="h-3.5 w-3.5" />} label="Kanban" />
      </div>

      <div className="relative min-w-[200px] max-w-xs flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Titel oder Firma suchen…"
          className="w-full rounded-md border border-gray-200 bg-white py-1 pl-8 pr-7 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-[#2c2c2e] dark:bg-[#232325]"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10"
            aria-label="Suche leeren"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      <select
        value={stageGroup}
        onChange={(e) => onStageGroupChange(e.target.value as StageGroupFilter)}
        className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs dark:border-[#2c2c2e] dark:bg-[#232325]"
      >
        <option value="all">Alle Phasen</option>
        <option value="open">Nur offene</option>
        <option value="won">Nur gewonnene</option>
        <option value="lost">Nur verlorene</option>
      </select>

      <select
        value={stageId}
        onChange={(e) => onStageIdChange(e.target.value)}
        className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs dark:border-[#2c2c2e] dark:bg-[#232325]"
      >
        <option value="">Alle Stages</option>
        {stages
          .filter((s) => stageGroup === "all" || s.kind === stageGroup)
          .map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
      </select>

      <select
        value={assigneeId}
        onChange={(e) => onAssigneeChange(e.target.value)}
        className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs dark:border-[#2c2c2e] dark:bg-[#232325]"
      >
        <option value="">Alle Vertriebler</option>
        {team.map((m) => (
          <option key={m.id} value={m.id}>{m.name || "Ohne Name"}</option>
        ))}
      </select>

      {hasActiveFilter && (
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500 hover:bg-gray-50 dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-400 dark:hover:bg-white/5"
        >
          <X className="h-3 w-3" />
          Zurücksetzen
        </button>
      )}

      <span className="text-[11px] text-gray-400">
        {shownCount} / {totalCount}
      </span>

      <div className="ml-auto flex items-center gap-2">
        <SalesReportButton />
        <button
          type="button"
          onClick={onCreateClick}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-primary-dark"
        >
          <Plus className="h-3.5 w-3.5" />
          Neuer Deal
        </button>
      </div>
    </div>
  );
}

/** Letzte 12 Monate als `{ value: "YYYY-MM", label: "Juli 2026" }`, neuester zuerst. */
function lastTwelveMonths(): { value: string; label: string }[] {
  const now = new Date();
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
    out.push({ value, label });
  }
  return out;
}

/**
 * Button „Sales-Report" + Monats-Popover. Lädt die KPI-PDF für den gewählten
 * Monat serverseitig (Headless-Chromium) und stößt den Download an.
 */
function SalesReportButton() {
  const { addToast } = useToastContext();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [months] = useState(lastTwelveMonths);
  const [month, setMonth] = useState(() => months[0]?.value ?? "");
  const containerRef = useRef<HTMLDivElement>(null);

  // Klick außerhalb / Escape schließt das Popover.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function download() {
    if (!month) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/deals/kpi-pdf?month=${month}`, { cache: "no-store" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Fehler ${res.status}`);
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `sales-report-${month}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
      setOpen(false);
      addToast("Sales-Report wird heruntergeladen.", "success");
    } catch (e) {
      addToast(e instanceof Error ? e.message : "Report konnte nicht erstellt werden.", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-200 dark:hover:bg-white/5"
      >
        <FileDown className="h-3.5 w-3.5" />
        Sales-Report
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-lg dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
          <p className="mb-1 text-xs font-semibold text-gray-900 dark:text-gray-100">KPI-Report als PDF</p>
          <p className="mb-2.5 text-[11px] text-gray-500 dark:text-gray-400">
            Monat wählen — alle Sales-Zahlen werden automatisch berechnet.
          </p>
          <label className="mb-1 block text-[11px] font-medium text-gray-500 dark:text-gray-400">Monat</label>
          <div className="relative mb-3">
            <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              disabled={loading}
              className="w-full appearance-none rounded-md border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs capitalize focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-[#2c2c2e] dark:bg-[#232325]"
            >
              {months.map((m) => (
                <option key={m.value} value={m.value} className="capitalize">
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={download}
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-primary-dark disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Wird erstellt…
              </>
            ) : (
              <>
                <FileDown className="h-3.5 w-3.5" />
                PDF herunterladen
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function ViewToggleButton({
  active, onClick, icon, label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs ${
        active ? "bg-gray-200 font-medium dark:bg-white/10" : "text-gray-500"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
