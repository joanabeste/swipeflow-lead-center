"use client";

import { useMemo, useState } from "react";
import type { DealStage, DealWithRelations } from "@/lib/deals/types";
import { NewDealDialog } from "./new-deal-dialog";
import { DealsToolbar } from "./_components/deals-toolbar";
import { KanbanView } from "./_components/kanban-view";
import { TableView } from "./_components/table-view";
import { dateToMonthValue } from "./_lib/close-month";
import { currentMonth } from "@/lib/deals/month";
import type { SortDir, SortKey, ViewMode } from "./_lib/types";

export function DealsBoard({
  deals,
  stages,
  team,
}: {
  deals: DealWithRelations[];
  stages: DealStage[];
  team: { id: string; name: string; avatarUrl: string | null }[];
}) {
  const [view, setView] = useState<ViewMode>("kanban");
  const [filterAssignee, setFilterAssignee] = useState<string>("");
  const [filterStageId, setFilterStageId] = useState<string>("");
  const [filterMonth, setFilterMonth] = useState<string>(currentMonth);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [createOpen, setCreateOpen] = useState(false);

  const stageById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return deals.filter((d) => {
      if (filterAssignee && d.assignedTo !== filterAssignee) return false;
      if (filterStageId && d.stageId !== filterStageId) return false;
      // Monats-Scope: offene Deals immer zeigen; gewonnene/verlorene nur, wenn ihr
      // Abschlussdatum im gewählten Monat liegt (Fallback updatedAt für Alt-Deals
      // ohne actual_close_date, damit keiner ganz unsichtbar wird).
      const kind = stageById.get(d.stageId)?.kind ?? "open";
      if (kind === "won" || kind === "lost") {
        const m = d.actualCloseDate ? dateToMonthValue(d.actualCloseDate) : dateToMonthValue(d.updatedAt);
        if (m !== filterMonth) return false;
      }
      if (q) {
        const hay = `${d.title} ${d.company_name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [deals, filterAssignee, filterStageId, filterMonth, search, stageById]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const arr = [...filtered];
    arr.sort((a, b) => {
      switch (sortKey) {
        case "title":
          return a.title.localeCompare(b.title, "de") * dir;
        case "stage": {
          const oa = stageById.get(a.stageId)?.displayOrder ?? 0;
          const ob = stageById.get(b.stageId)?.displayOrder ?? 0;
          return (oa - ob) * dir;
        }
        case "amount":
          return (a.amountCents - b.amountCents) * dir;
        case "probability": {
          const pa = a.probability;
          const pb = b.probability;
          if (pa == null && pb == null) return 0;
          if (pa == null) return 1;
          if (pb == null) return -1;
          return (pa - pb) * dir;
        }
        case "assignee":
          return (a.assignee_name ?? "").localeCompare(b.assignee_name ?? "", "de") * dir;
        case "lastFollowup": {
          const va = a.lastFollowupAt ? new Date(a.lastFollowupAt).getTime() : null;
          const vb = b.lastFollowupAt ? new Date(b.lastFollowupAt).getTime() : null;
          if (va == null && vb == null) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          return (va - vb) * dir;
        }
        case "updated":
        default:
          return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * dir;
      }
    });
    return arr;
  }, [filtered, sortKey, sortDir, stageById]);

  function toggleSort(key: SortKey, defaultDir: SortDir = "desc") {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir(defaultDir);
      return key;
    });
  }

  function resetFilters() {
    setFilterAssignee("");
    setFilterStageId("");
    setFilterMonth(currentMonth());
    setSearch("");
    setSortKey("updated");
    setSortDir("desc");
  }

  const hasActiveFilter =
    filterAssignee !== "" ||
    filterStageId !== "" ||
    filterMonth !== currentMonth() ||
    search.trim() !== "" ||
    sortKey !== "updated" ||
    sortDir !== "desc";

  const activeStages = stages.filter((s) => s.isActive);

  return (
    <div className="space-y-5">
      <DealsToolbar
        view={view}
        onViewChange={setView}
        search={search}
        onSearchChange={setSearch}
        month={filterMonth}
        onMonthChange={setFilterMonth}
        stageId={filterStageId}
        onStageIdChange={setFilterStageId}
        assigneeId={filterAssignee}
        onAssigneeChange={setFilterAssignee}
        stages={stages}
        team={team}
        totalCount={deals.length}
        shownCount={sorted.length}
        hasActiveFilter={hasActiveFilter}
        onReset={resetFilters}
        onCreateClick={() => setCreateOpen(true)}
      />

      {view === "kanban" ? (
        <KanbanView deals={sorted} stages={activeStages} />
      ) : (
        <TableView
          deals={sorted}
          stages={activeStages}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
        />
      )}

      {createOpen && (
        <NewDealDialog
          stages={activeStages}
          team={team}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  );
}
