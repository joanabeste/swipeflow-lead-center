"use client";

import { useMemo, useState } from "react";
import type { DealStage, DealWithRelations } from "@/lib/deals/types";
import { NewDealDialog } from "./new-deal-dialog";
import { PipelineCharts } from "./pipeline-charts";
import { KpisRow } from "./_components/kpis-row";
import { DealsToolbar } from "./_components/deals-toolbar";
import { KanbanView } from "./_components/kanban-view";
import { TableView } from "./_components/table-view";
import { computeKpis } from "./_lib/compute-kpis";
import type { SortDir, SortKey, StageGroupFilter, ViewMode } from "./_lib/types";

export function DealsBoard({
  deals,
  stages,
  team,
}: {
  deals: DealWithRelations[];
  stages: DealStage[];
  team: { id: string; name: string; avatarUrl: string | null }[];
}) {
  const [view, setView] = useState<ViewMode>("table");
  const [filterAssignee, setFilterAssignee] = useState<string>("");
  const [filterStageGroup, setFilterStageGroup] = useState<StageGroupFilter>("all");
  const [filterStageId, setFilterStageId] = useState<string>("");
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
      if (filterStageGroup !== "all") {
        const kind = stageById.get(d.stageId)?.kind ?? "open";
        if (kind !== filterStageGroup) return false;
      }
      if (q) {
        const hay = `${d.title} ${d.company_name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [deals, filterAssignee, filterStageId, filterStageGroup, search, stageById]);

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
    setFilterStageGroup("all");
    setFilterStageId("");
    setSearch("");
    setSortKey("updated");
    setSortDir("desc");
  }

  const hasActiveFilter =
    filterAssignee !== "" ||
    filterStageGroup !== "all" ||
    filterStageId !== "" ||
    search.trim() !== "" ||
    sortKey !== "updated" ||
    sortDir !== "desc";

  const kpis = useMemo(() => computeKpis(filtered, stages), [filtered, stages]);
  const activeStages = stages.filter((s) => s.isActive);

  return (
    <div className="space-y-5">
      <KpisRow kpis={kpis} />

      <DealsToolbar
        view={view}
        onViewChange={setView}
        search={search}
        onSearchChange={setSearch}
        stageGroup={filterStageGroup}
        onStageGroupChange={(v) => {
          setFilterStageGroup(v);
          setFilterStageId("");
        }}
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

      <PipelineCharts deals={filtered} stages={stages} />

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
