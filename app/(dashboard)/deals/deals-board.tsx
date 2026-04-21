"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Plus, LayoutGrid, List, TrendingUp, Trophy, Percent, Euro, Sparkles, Search, ArrowDown, ArrowUp, ArrowUpDown, X,
} from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { DealStage, DealWithRelations } from "@/lib/deals/types";
import { formatAmount, isStale } from "@/lib/deals/types";
import { updateDealAction } from "./actions";
import { useToastContext } from "../toast-provider";
import { NewDealDialog } from "./new-deal-dialog";
import { PipelineCharts } from "./pipeline-charts";
import { useConfetti } from "@/components/confetti";

type ViewMode = "kanban" | "table";
type StageGroupFilter = "all" | "open" | "won" | "lost";
type SortKey = "updated" | "title" | "stage" | "amount" | "probability" | "assignee" | "lastFollowup";
type SortDir = "asc" | "desc";

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
          // Nulls immer nach unten — unabhängig von der Sortierrichtung.
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
      {/* Hero-KPI + Neben-KPIs */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Hero: Offenes Volumen — groß, primary-Farbig, motivierend */}
        <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-6 dark:border-primary/20">
          <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-primary/10 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
              <Euro className="h-3.5 w-3.5" />
              Offenes Volumen
            </div>
            <p className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
              {formatAmount(kpis.openVolume)}
            </p>
            <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
              {kpis.openCount} {kpis.openCount === 1 ? "offener Deal" : "offene Deals"}
              {kpis.weightedForecastCents > 0 && (
                <>
                  <span className="mx-1.5">·</span>
                  <span>
                    Forecast{" "}
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      {formatAmount(kpis.weightedForecastCents)}
                    </span>
                  </span>
                </>
              )}
            </p>
            {kpis.motivationalMessage && (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 text-xs font-medium text-primary dark:bg-white/5">
                <Sparkles className="h-3 w-3" />
                {kpis.motivationalMessage}
              </p>
            )}
          </div>
        </div>

        {/* Neben-KPIs */}
        <div className="grid grid-cols-3 gap-3 lg:col-span-2">
          <KpiCard
            icon={Trophy}
            label="Gewonnen (30 Tage)"
            value={formatAmount(kpis.wonLast30d)}
            subtitle={`${kpis.wonCount30d} Abschlüsse`}
            tone="success"
          />
          <KpiCard
            icon={Percent}
            label="Gewinn-Quote"
            value={`${Math.round(kpis.winRate * 100)}%`}
            subtitle={`${kpis.wonCount} / ${kpis.wonCount + kpis.lostCount} abgeschlossen`}
            tone="neutral"
          />
          <KpiCard
            icon={TrendingUp}
            label="Ø Deal-Größe"
            value={formatAmount(kpis.avgDealSize)}
            tone="neutral"
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
        <div className="flex rounded-md border border-gray-200 p-0.5 dark:border-[#2c2c2e]">
          <button
            type="button"
            onClick={() => setView("table")}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs ${
              view === "table"
                ? "bg-gray-200 font-medium dark:bg-white/10"
                : "text-gray-500"
            }`}
          >
            <List className="h-3.5 w-3.5" />
            Tabelle
          </button>
          <button
            type="button"
            onClick={() => setView("kanban")}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs ${
              view === "kanban"
                ? "bg-gray-200 font-medium dark:bg-white/10"
                : "text-gray-500"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Kanban
          </button>
        </div>

        <div className="relative min-w-[200px] flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Titel oder Firma suchen…"
            className="w-full rounded-md border border-gray-200 bg-white py-1 pl-8 pr-7 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-[#2c2c2e] dark:bg-[#232325]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10"
              aria-label="Suche leeren"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <select
          value={filterStageGroup}
          onChange={(e) => {
            setFilterStageGroup(e.target.value as StageGroupFilter);
            setFilterStageId("");
          }}
          className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs dark:border-[#2c2c2e] dark:bg-[#232325]"
        >
          <option value="all">Alle Phasen</option>
          <option value="open">Nur offene</option>
          <option value="won">Nur gewonnene</option>
          <option value="lost">Nur verlorene</option>
        </select>

        <select
          value={filterStageId}
          onChange={(e) => setFilterStageId(e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs dark:border-[#2c2c2e] dark:bg-[#232325]"
        >
          <option value="">Alle Stages</option>
          {stages
            .filter((s) => filterStageGroup === "all" || s.kind === filterStageGroup)
            .map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
        </select>

        <select
          value={filterAssignee}
          onChange={(e) => setFilterAssignee(e.target.value)}
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
            onClick={resetFilters}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500 hover:bg-gray-50 dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-400 dark:hover:bg-white/5"
          >
            <X className="h-3 w-3" />
            Zurücksetzen
          </button>
        )}

        <span className="text-[11px] text-gray-400">
          {sorted.length} / {deals.length}
        </span>

        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-primary-dark"
        >
          <Plus className="h-3.5 w-3.5" />
          Neuer Deal
        </button>
      </div>

      {/* View — direkt nach Toolbar, Charts rutschen nach unten */}
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

      {/* Charts zur Übersicht unten */}
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

// ─── KPIs ─────────────────────────────────────────────────────

function computeKpis(deals: DealWithRelations[], stages: DealStage[]) {
  const now = Date.now();
  const thirtyDays = 30 * 24 * 3600 * 1000;
  const stageById = new Map(stages.map((s) => [s.id, s]));

  let openVolume = 0;
  let openCount = 0;
  let weightedForecastCents = 0;
  let wonLast30d = 0;
  let wonCount30d = 0;
  let wonTotal = 0;
  let lostTotal = 0;
  let wonCount = 0;
  let lostCount = 0;
  let dealCount = 0;
  let totalVolumeAll = 0;

  for (const d of deals) {
    const stage = stageById.get(d.stageId);
    const kind = stage?.kind ?? "open";
    dealCount++;
    totalVolumeAll += d.amountCents;
    if (kind === "open") {
      openVolume += d.amountCents;
      openCount++;
      // Gewichteter Forecast: amount × probability/100 (oder 0 wenn null).
      const p = d.probability ?? 0;
      weightedForecastCents += Math.round((d.amountCents * p) / 100);
    } else if (kind === "won") {
      wonCount++;
      wonTotal += d.amountCents;
      const closedAt = d.actualCloseDate ? new Date(d.actualCloseDate).getTime() : new Date(d.updatedAt).getTime();
      if (now - closedAt <= thirtyDays) {
        wonLast30d += d.amountCents;
        wonCount30d++;
      }
    } else if (kind === "lost") {
      lostCount++;
      lostTotal += d.amountCents;
    }
  }

  const closedCount = wonCount + lostCount;
  const winRate = closedCount > 0 ? wonCount / closedCount : 0;
  const avgDealSize = dealCount > 0 ? Math.round(totalVolumeAll / dealCount) : 0;

  // Motivierende Mini-Message — fokus auf das Positive.
  let motivationalMessage = "";
  if (openCount === 0 && wonCount === 0) {
    motivationalMessage = "Bereit für deinen ersten Deal — leg los.";
  } else if (wonCount30d > 0 && wonCount30d >= 3) {
    motivationalMessage = `🔥 ${wonCount30d} Abschlüsse im letzten Monat — weiter so.`;
  } else if (winRate >= 0.5 && closedCount >= 3) {
    motivationalMessage = `Starke ${Math.round(winRate * 100)}% Gewinn-Quote — dran bleiben.`;
  } else if (openCount >= 5) {
    motivationalMessage = `${openCount} offene Deals — ein Closing-Call pro Tag macht den Unterschied.`;
  } else if (openCount > 0) {
    motivationalMessage = "Jeder Follow-Up zählt. Nächster Schritt?";
  }

  return {
    openVolume, openCount, weightedForecastCents,
    wonLast30d, wonCount30d, wonTotal,
    winRate, wonCount, lostCount, lostTotal,
    avgDealSize, motivationalMessage,
  };
}

function KpiCard({
  icon: Icon,
  label,
  value,
  subtitle,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subtitle?: string;
  tone: "primary" | "success" | "neutral";
}) {
  const toneClass =
    tone === "primary"
      ? "bg-primary/10 text-primary"
      : tone === "success"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
      : "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300";
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
      <div className="flex items-center gap-2">
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${toneClass}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {label}
        </p>
      </div>
      <p className="mt-2 text-xl font-bold">{value}</p>
      {subtitle && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
    </div>
  );
}

// ─── Kanban ───────────────────────────────────────────────────

function KanbanView({ deals, stages }: { deals: DealWithRelations[]; stages: DealStage[] }) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const fireConfetti = useConfetti();
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Lokaler optimistic state für Stage-Wechsel
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const effectiveStage = (d: DealWithRelations) => overrides[d.id] ?? d.stageId;
  const byStage = new Map<string, DealWithRelations[]>();
  for (const s of stages) byStage.set(s.id, []);
  for (const d of deals) {
    const arr = byStage.get(effectiveStage(d));
    if (arr) arr.push(d);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const dealId = String(active.id);
    const newStage = String(over.id);
    const deal = deals.find((d) => d.id === dealId);
    if (!deal) return;
    if (effectiveStage(deal) === newStage) return;

    setOverrides((m) => ({ ...m, [dealId]: newStage }));
    const previousKind = stages.find((s) => s.id === deal.stageId)?.kind;
    const newKind = stages.find((s) => s.id === newStage)?.kind;
    startTransition(async () => {
      const res = await updateDealAction(dealId, { stageId: newStage });
      if ("error" in res) {
        addToast(res.error, "error");
        setOverrides((m) => {
          const next = { ...m };
          delete next[dealId];
          return next;
        });
      } else {
        if (newKind === "won" && previousKind !== "won") fireConfetti();
        router.refresh();
      }
    });
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="grid auto-cols-[280px] grid-flow-col gap-3 overflow-x-auto pb-2">
        {stages.map((stage) => {
          const stageDeals = byStage.get(stage.id) ?? [];
          const volume = stageDeals.reduce((s, d) => s + d.amountCents, 0);
          return (
            <StageColumn
              key={stage.id}
              stage={stage}
              deals={stageDeals}
              volume={volume}
              stages={stages}
            />
          );
        })}
      </div>
    </DndContext>
  );
}

function StageColumn({
  stage,
  deals,
  volume,
  stages,
}: {
  stage: DealStage;
  deals: DealWithRelations[];
  volume: number;
  stages: DealStage[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-xl border bg-gray-50/50 p-2 transition dark:bg-white/[0.02] ${
        isOver ? "border-primary bg-primary/5" : "border-gray-200 dark:border-[#2c2c2e]"
      }`}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: stage.color }}
          />
          <p className="text-sm font-semibold">{stage.label}</p>
          <span className="text-xs text-gray-400">{deals.length}</span>
        </div>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
          {formatAmount(volume)}
        </p>
      </div>
      <div className="flex-1 space-y-1.5">
        {deals.length === 0 && (
          <p className="rounded-md border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400 dark:border-[#2c2c2e]">
            Hier Deals ablegen
          </p>
        )}
        {deals.map((d) => (
          <DealCard key={d.id} deal={d} stages={stages} />
        ))}
      </div>
    </div>
  );
}

function DealCard({ deal, stages }: { deal: DealWithRelations; stages: DealStage[] }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };
  const stale = isStale(deal, stages);

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Link
        href={`/deals/${deal.id}`}
        onClick={(e) => {
          if (isDragging) e.preventDefault();
        }}
        className="block rounded-lg border border-gray-200 bg-white p-2.5 text-sm shadow-sm hover:border-primary hover:shadow-md dark:border-[#2c2c2e] dark:bg-[#1c1c1e]"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="truncate font-medium" title={deal.title}>{deal.title}</p>
          {stale && (
            <span
              className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
              title="Seit >30 Tagen keine Änderung"
            >
              stale
            </span>
          )}
        </div>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
          {deal.company_name}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-sm font-semibold text-primary">
              {formatAmount(deal.amountCents, deal.currency)}
            </p>
            {deal.probability != null && (
              <span
                className="shrink-0 rounded bg-gray-100 px-1 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-white/5 dark:text-gray-400"
                title={`Closing-Wahrscheinlichkeit · Forecast ${formatAmount(
                  Math.round((deal.amountCents * deal.probability) / 100),
                  deal.currency,
                )}`}
              >
                {deal.probability}%
              </span>
            )}
          </div>
          {deal.assignee_name && (
            <AvatarChip name={deal.assignee_name} avatarUrl={deal.assignee_avatar_url} />
          )}
        </div>
        {deal.nextStep && (
          <p
            className="mt-1.5 line-clamp-2 text-[11px] italic text-gray-500 dark:text-gray-400"
            title={deal.nextStep}
          >
            → {deal.nextStep}
          </p>
        )}
      </Link>
    </div>
  );
}

function AvatarChip({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      <div className="relative h-5 w-5 overflow-hidden rounded-full" title={name}>
        <Image src={avatarUrl} alt={name} fill sizes="20px" className="object-cover" unoptimized />
      </div>
    );
  }
  const initials = name
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "").join("");
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-[9px] font-semibold text-gray-700 dark:bg-white/10 dark:text-gray-300"
      title={name}
    >
      {initials}
    </span>
  );
}

// ─── Tabelle ──────────────────────────────────────────────────

function TableView({
  deals,
  stages,
  sortKey,
  sortDir,
  onSort,
}: {
  deals: DealWithRelations[];
  stages: DealStage[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey, defaultDir?: SortDir) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-[#2c2c2e] dark:text-gray-400">
            <SortTh label="Deal / Firma" k="title" sortKey={sortKey} sortDir={sortDir} onSort={onSort} defaultDir="asc" />
            <SortTh label="Stage" k="stage" sortKey={sortKey} sortDir={sortDir} onSort={onSort} defaultDir="asc" />
            <SortTh label="Volumen" k="amount" sortKey={sortKey} sortDir={sortDir} onSort={onSort} defaultDir="desc" align="right" />
            <SortTh label="Closing-%" k="probability" sortKey={sortKey} sortDir={sortDir} onSort={onSort} defaultDir="desc" align="right" />
            <SortTh label="Zuständig" k="assignee" sortKey={sortKey} sortDir={sortDir} onSort={onSort} defaultDir="asc" />
            <th className="px-3 py-2.5">Nächster Schritt</th>
            <SortTh label="Letzter FollowUp" k="lastFollowup" sortKey={sortKey} sortDir={sortDir} onSort={onSort} defaultDir="desc" />
          </tr>
        </thead>
        <tbody>
          {deals.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                Noch keine Deals.
              </td>
            </tr>
          )}
          {deals.map((d) => {
            // Titel und Firmenname sind oft identisch (z.B. "Clemens" / "Clemens").
            // In dem Fall lohnt sich die zweite Zeile nicht.
            const titleMatchesCompany = d.title.trim().toLowerCase() === d.company_name.trim().toLowerCase();
            return (
              <tr
                key={d.id}
                className="cursor-pointer border-b border-gray-100 last:border-b-0 hover:bg-gray-50 dark:border-[#2c2c2e] dark:hover:bg-white/[0.02]"
                onClick={(e) => {
                  if (e.target instanceof HTMLAnchorElement) return;
                  window.location.href = `/deals/${d.id}`;
                }}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Link href={`/deals/${d.id}`} className="font-medium hover:underline">
                      {d.title}
                    </Link>
                    {isStale(d, stages) && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                        stale
                      </span>
                    )}
                  </div>
                  {!titleMatchesCompany && (
                    <Link
                      href={`/crm/${d.leadId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-gray-500 hover:underline dark:text-gray-400"
                    >
                      {d.company_name}
                    </Link>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: `${d.stage_color}20`, color: d.stage_color }}
                  >
                    {d.stage_label}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-medium text-primary">
                  {formatAmount(d.amountCents, d.currency)}
                </td>
                <td className="px-3 py-2 text-right text-xs text-gray-500 dark:text-gray-400">
                  {d.probability != null ? `${d.probability}%` : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                  {d.assignee_name ?? "—"}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400" title={d.nextStep ?? undefined}>
                  <span className="line-clamp-1">{d.nextStep ?? "—"}</span>
                </td>
                <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                  {d.lastFollowupAt ? new Date(d.lastFollowupAt).toLocaleDateString("de-DE") : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SortTh({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
  defaultDir = "desc",
  align = "left",
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey, defaultDir?: SortDir) => void;
  defaultDir?: SortDir;
  align?: "left" | "right";
}) {
  const active = sortKey === k;
  const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={`px-3 py-2.5 ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => onSort(k, defaultDir)}
        className={`inline-flex items-center gap-1 ${
          align === "right" ? "flex-row-reverse" : ""
        } ${active ? "text-primary" : "hover:text-gray-700 dark:hover:text-gray-200"}`}
      >
        {label}
        <Icon className={`h-3 w-3 ${active ? "opacity-100" : "opacity-40"}`} />
      </button>
    </th>
  );
}
