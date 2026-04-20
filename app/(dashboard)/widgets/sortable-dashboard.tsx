"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, Pencil, X, Check, Loader2 } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { saveDashboardWidgets } from "./actions";
import { useToastContext } from "../toast-provider";

/**
 * Rendert das Dashboard-Grid entweder im View-Mode (Paar-Grid für
 * kompatible Widgets) oder im Edit-Mode (vertikale Liste mit Drag-Handles).
 *
 * Speichert jeden Drag-End sofort via `saveDashboardWidgets` und refresht
 * die Page. Das Modal-Editor-Feature (Widget hinzufügen/entfernen) bleibt
 * erhalten — dieser Live-DnD ergänzt nur Reorder + Quick-Remove.
 */
export function SortableDashboard({
  initialOrder,
  widgetNodes,
  fullWidthKeys,
}: {
  initialOrder: string[];
  widgetNodes: Record<string, ReactNode>;
  fullWidthKeys: string[];
}) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [order, setOrder] = useState<string[]>(initialOrder);
  const [editMode, setEditMode] = useState(false);
  const [pending, startTransition] = useTransition();
  const fullWidthSet = new Set(fullWidthKeys);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function persistOrder(next: string[]) {
    startTransition(async () => {
      const res = await saveDashboardWidgets(next);
      if (res.error) {
        addToast(res.error, "error");
      } else {
        router.refresh();
      }
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(active.id as string);
    const newIndex = order.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(order, oldIndex, newIndex);
    setOrder(next);
    persistOrder(next);
  }

  function removeWidget(key: string) {
    const next = order.filter((k) => k !== key);
    setOrder(next);
    persistOrder(next);
  }

  if (editMode) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl border border-primary/40 bg-primary/5 px-4 py-2.5">
          <p className="text-sm text-primary">
            Bearbeiten-Modus: Widgets per Drag-and-Drop sortieren oder entfernen. Änderungen werden automatisch gespeichert.
          </p>
          <button
            onClick={() => setEditMode(false)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-primary-dark"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Fertig
          </button>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <div className="space-y-4">
              {order.map((key) => (
                <SortableWidgetWrapper
                  key={key}
                  widgetKey={key}
                  onRemove={() => removeWidget(key)}
                >
                  {widgetNodes[key]}
                </SortableWidgetWrapper>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    );
  }

  // View-Mode: Paar-Grid für kompatible Widgets.
  const rendered: ReactNode[] = [];
  let i = 0;
  while (i < order.length) {
    const key = order[i];
    if (fullWidthSet.has(key)) {
      rendered.push(<div key={key}>{widgetNodes[key]}</div>);
      i++;
    } else {
      const next = order[i + 1];
      const pair = next && !fullWidthSet.has(next) ? next : null;
      rendered.push(
        <div key={key} className={pair ? "grid gap-6 lg:grid-cols-2" : ""}>
          {widgetNodes[key]}
          {pair && widgetNodes[pair]}
        </div>,
      );
      i += pair ? 2 : 1;
    }
  }

  return (
    <>
      <div className="flex justify-end">
        <button
          onClick={() => setEditMode(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-[#2c2c2e] dark:text-gray-400 dark:hover:bg-white/5"
        >
          <Pencil className="h-3 w-3" />
          Bearbeiten
        </button>
      </div>
      <div className="mt-4 space-y-6">{rendered}</div>
    </>
  );
}

function SortableWidgetWrapper({
  widgetKey,
  children,
  onRemove,
}: {
  widgetKey: string;
  children: ReactNode;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widgetKey,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <div className="pointer-events-none absolute inset-0 rounded-xl border-2 border-dashed border-primary/30" />
      <div className="absolute -left-2 top-2 z-10 flex flex-col gap-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none rounded bg-white p-1 text-gray-400 shadow hover:text-gray-700 active:cursor-grabbing dark:bg-[#2c2c2e]"
          aria-label="Widget verschieben"
          title="Ziehen zum Umsortieren"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="rounded bg-white p-1 text-gray-400 shadow hover:bg-red-50 hover:text-red-600 dark:bg-[#2c2c2e] dark:hover:bg-red-900/20"
          aria-label="Widget entfernen"
          title="Aus Dashboard entfernen"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="pointer-events-none [&>*]:pointer-events-none">
        {children}
      </div>
    </div>
  );
}
