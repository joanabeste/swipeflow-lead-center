"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Plus, LayoutGrid, List, TrendingUp, Trophy, Percent, Euro,
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

type ViewMode = "kanban" | "table";

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
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(
    () => deals.filter((d) => (filterAssignee ? d.assignedTo === filterAssignee : true)),
    [deals, filterAssignee],
  );

  const kpis = useMemo(() => computeKpis(filtered, stages), [filtered, stages]);
  const activeStages = stages.filter((s) => s.isActive);

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          icon={Euro}
          label="Offenes Volumen"
          value={formatAmount(kpis.openVolume)}
          tone="primary"
        />
        <KpiCard
          icon={Trophy}
          label="Gewonnen (30 Tage)"
          value={formatAmount(kpis.wonLast30d)}
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

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
        <div className="flex rounded-md border border-gray-200 p-0.5 dark:border-[#2c2c2e]">
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
        </div>

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

        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-primary-dark"
        >
          <Plus className="h-3.5 w-3.5" />
          Neuer Deal
        </button>
      </div>

      {/* Charts */}
      <PipelineCharts deals={filtered} stages={stages} />

      {/* View */}
      {view === "kanban" ? (
        <KanbanView deals={filtered} stages={activeStages} />
      ) : (
        <TableView deals={filtered} stages={activeStages} />
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

// ─── KPIs ─────────────────────────────────────────────────────

function computeKpis(deals: DealWithRelations[], stages: DealStage[]) {
  const now = Date.now();
  const thirtyDays = 30 * 24 * 3600 * 1000;
  const stageById = new Map(stages.map((s) => [s.id, s]));

  let openVolume = 0;
  let wonLast30d = 0;
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
    if (kind === "open") openVolume += d.amountCents;
    else if (kind === "won") {
      wonCount++;
      wonTotal += d.amountCents;
      const closedAt = d.actualCloseDate ? new Date(d.actualCloseDate).getTime() : new Date(d.updatedAt).getTime();
      if (now - closedAt <= thirtyDays) wonLast30d += d.amountCents;
    } else if (kind === "lost") {
      lostCount++;
      lostTotal += d.amountCents;
    }
  }

  const closedCount = wonCount + lostCount;
  const winRate = closedCount > 0 ? wonCount / closedCount : 0;
  const avgDealSize = dealCount > 0 ? Math.round(totalVolumeAll / dealCount) : 0;

  return { openVolume, wonLast30d, winRate, wonCount, lostCount, avgDealSize, wonTotal, lostTotal };
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
        <div className="mt-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-primary">
            {formatAmount(deal.amountCents, deal.currency)}
          </p>
          {deal.assignee_name && (
            <AvatarChip name={deal.assignee_name} avatarUrl={deal.assignee_avatar_url} />
          )}
        </div>
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

function TableView({ deals, stages }: { deals: DealWithRelations[]; stages: DealStage[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-[#2c2c2e] dark:text-gray-400">
            <th className="px-3 py-2.5">Titel</th>
            <th className="px-3 py-2.5">Firma</th>
            <th className="px-3 py-2.5">Stage</th>
            <th className="px-3 py-2.5 text-right">Volumen</th>
            <th className="px-3 py-2.5">Zuständig</th>
            <th className="px-3 py-2.5">Erwartet</th>
            <th className="px-3 py-2.5">Aktualisiert</th>
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
          {deals.map((d) => (
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
              </td>
              <td className="px-3 py-2">
                <Link
                  href={`/crm/${d.leadId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-gray-600 hover:underline dark:text-gray-300"
                >
                  {d.company_name}
                </Link>
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
              <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                {d.assignee_name ?? "—"}
              </td>
              <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                {d.expectedCloseDate ? new Date(d.expectedCloseDate).toLocaleDateString("de-DE") : "—"}
              </td>
              <td className="px-3 py-2 text-xs text-gray-400">
                {new Date(d.updatedAt).toLocaleDateString("de-DE")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
