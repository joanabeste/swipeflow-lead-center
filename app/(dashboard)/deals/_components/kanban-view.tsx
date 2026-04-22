"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { DealStage, DealWithRelations } from "@/lib/deals/types";
import { formatAmount, isStale } from "@/lib/deals/types";
import { updateDealAction } from "../actions";
import { useToastContext } from "../../toast-provider";
import { useConfetti } from "@/components/confetti";
import { AvatarChip } from "./avatar-chip";

export function KanbanView({
  deals, stages,
}: {
  deals: DealWithRelations[];
  stages: DealStage[];
}) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const fireConfetti = useConfetti();
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

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
  stage, deals, volume, stages,
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
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: stage.color }} />
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
          <KanbanDealCard key={d.id} deal={d} stages={stages} />
        ))}
      </div>
    </div>
  );
}

function KanbanDealCard({ deal, stages }: { deal: DealWithRelations; stages: DealStage[] }) {
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
          <div className="flex min-w-0 items-center gap-1.5">
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
