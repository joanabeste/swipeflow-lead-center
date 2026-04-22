"use client";

import { LayoutGrid, List, Plus, Search, X } from "lucide-react";
import type { DealStage } from "@/lib/deals/types";
import type { StageGroupFilter, ViewMode } from "../_lib/types";

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

      <button
        type="button"
        onClick={onCreateClick}
        className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-primary-dark"
      >
        <Plus className="h-3.5 w-3.5" />
        Neuer Deal
      </button>
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
