"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, GripVertical, Loader2, Pencil, Plus, X } from "lucide-react";
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
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { saveDashboardLayout } from "./actions";
import {
  WIDGET_REGISTRY,
  WIDGET_WIDTHS,
  getWidgetMeta,
  widgetColSpan,
  type WidgetLayoutItem,
  type WidgetWidth,
} from "./registry";
import { useToastContext } from "../toast-provider";
import type { ServiceMode } from "@/lib/types";

/**
 * Einheitliches Dashboard-Grid + Editor.
 *
 * - View-Mode: 12-Spalten-Grid, jedes Widget mit individueller col-span.
 * - Edit-Mode: gleiche Layout-Basis, zusätzlich Drag-Handle, Remove-Button,
 *   Breiten-Picker und Widget-Add-Panel unten.
 *
 * Änderungen werden per Auto-Save persistiert — kein separater Modal-Editor
 * mehr nötig.
 */
export function SortableDashboard({
  initialLayout,
  widgetNodes,
  serviceMode,
}: {
  initialLayout: WidgetLayoutItem[];
  widgetNodes: Record<string, ReactNode>;
  serviceMode: ServiceMode;
}) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [layout, setLayout] = useState<WidgetLayoutItem[]>(initialLayout);
  const [editMode, setEditMode] = useState(false);
  const [pending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function persist(next: WidgetLayoutItem[]) {
    startTransition(async () => {
      const res = await saveDashboardLayout(next);
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
    const oldIndex = layout.findIndex((i) => i.k === active.id);
    const newIndex = layout.findIndex((i) => i.k === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(layout, oldIndex, newIndex);
    setLayout(next);
    persist(next);
  }

  function removeWidget(key: string) {
    const next = layout.filter((i) => i.k !== key);
    setLayout(next);
    persist(next);
  }

  function setWidth(key: string, width: WidgetWidth) {
    const next = layout.map((i) => (i.k === key ? { ...i, w: width } : i));
    setLayout(next);
    persist(next);
  }

  function addWidget(key: string) {
    const meta = getWidgetMeta(key);
    if (!meta) return;
    const next: WidgetLayoutItem[] = [...layout, { k: key, w: meta.defaultWidth }];
    setLayout(next);
    persist(next);
  }

  const inactiveWidgets = useMemo(() => {
    const present = new Set(layout.map((i) => i.k));
    return WIDGET_REGISTRY.filter(
      (w) => !present.has(w.key) && (!w.serviceMode || w.serviceMode === serviceMode),
    );
  }, [layout, serviceMode]);

  return (
    <div>
      <div className="flex justify-end">
        {editMode ? (
          <button
            onClick={() => setEditMode(false)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-primary-dark"
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Fertig
          </button>
        ) : (
          <button
            onClick={() => setEditMode(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-[#2c2c2e] dark:text-gray-400 dark:hover:bg-white/5"
          >
            <Pencil className="h-3 w-3" />
            Bearbeiten
            {inactiveWidgets.length > 0 && (
              <span
                className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
                title={`${inactiveWidgets.length} zusätzliche Widgets verfügbar`}
              >
                +{inactiveWidgets.length}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Add-Panel im Edit-Mode nach oben gezogen — Widgets sind hier einfacher
          zu entdecken als am Seiten-Ende, wo man sie ggf. nie zu Gesicht bekommt. */}
      {editMode && inactiveWidgets.length > 0 && (
        <div className="mt-4">
          <AddWidgetPanel widgets={inactiveWidgets} onAdd={addWidget} />
        </div>
      )}

      <div className="mt-4">
        {editMode ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={layout.map((i) => i.k)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                {layout.map((item) => (
                  <EditableWidget
                    key={item.k}
                    item={item}
                    onRemove={() => removeWidget(item.k)}
                    onSetWidth={(w) => setWidth(item.k, w)}
                  >
                    {widgetNodes[item.k]}
                  </EditableWidget>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            {layout.map((item) => (
              <div
                key={item.k}
                className="col-span-1"
                style={{ gridColumn: `span ${widgetColSpan(item.w)} / span ${widgetColSpan(item.w)}` }}
              >
                {widgetNodes[item.k]}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Edit-Mode: Widget-Wrapper mit Griff, Breiten-Picker, X ─────────

function EditableWidget({
  item,
  onRemove,
  onSetWidth,
  children,
}: {
  item: WidgetLayoutItem;
  onRemove: () => void;
  onSetWidth: (w: WidgetWidth) => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.k,
  });
  const span = widgetColSpan(item.w);
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
    gridColumn: `span ${span} / span ${span}`,
  };
  const meta = getWidgetMeta(item.k);
  return (
    <div ref={setNodeRef} style={style} className="relative">
      <div className="pointer-events-none absolute -inset-1 rounded-xl border-2 border-dashed border-primary/30" />
      {/* Toolbar oberhalb des Widgets */}
      <div className="relative mb-2 flex items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none rounded bg-white p-1 text-gray-400 shadow hover:text-gray-700 active:cursor-grabbing dark:bg-[#2c2c2e]"
          aria-label={`${meta?.label ?? item.k} verschieben`}
          title="Ziehen zum Umsortieren"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <span className="truncate text-xs font-medium text-gray-500 dark:text-gray-400">
          {meta?.label ?? item.k}
        </span>
        <WidthPicker current={item.w} onChange={onSetWidth} />
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto rounded bg-white p-1 text-gray-400 shadow hover:bg-red-50 hover:text-red-600 dark:bg-[#2c2c2e] dark:hover:bg-red-900/20"
          aria-label={`${meta?.label ?? item.k} entfernen`}
          title="Aus Dashboard entfernen"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="pointer-events-none [&>*]:pointer-events-none">{children}</div>
    </div>
  );
}

function WidthPicker({
  current,
  onChange,
}: {
  current: WidgetWidth;
  onChange: (w: WidgetWidth) => void;
}) {
  // Visuelle Balken statt ⅓½⅔1 — auf einen Blick klar, welche Breite was bedeutet.
  const meta: Record<WidgetWidth, { pct: number; title: string }> = {
    third: { pct: 33, title: "Ein Drittel der Breite" },
    half: { pct: 50, title: "Halbe Breite" },
    "two-thirds": { pct: 66, title: "Zwei Drittel der Breite" },
    full: { pct: 100, title: "Volle Breite" },
  };
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-gray-200 bg-white p-1 shadow-sm dark:border-[#2c2c2e] dark:bg-[#161618]">
      {WIDGET_WIDTHS.map((w) => {
        const active = current === w;
        const { pct, title } = meta[w];
        return (
          <button
            key={w}
            type="button"
            onClick={() => onChange(w)}
            title={title}
            aria-label={title}
            aria-pressed={active}
            className={`flex h-5 w-8 items-center rounded px-1 transition ${
              active
                ? "bg-primary/15"
                : "hover:bg-gray-100 dark:hover:bg-white/5"
            }`}
          >
            <span className="block h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <span
                className={`block h-full rounded-full ${active ? "bg-primary" : "bg-gray-400 dark:bg-gray-500"}`}
                style={{ width: `${pct}%` }}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Edit-Mode: Add-Panel ────────────────────────────────────────────

function AddWidgetPanel({
  widgets,
  onAdd,
}: {
  widgets: { key: string; label: string; description: string }[];
  onAdd: (key: string) => void;
}) {
  return (
    <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 dark:border-primary/30 dark:bg-primary/5">
      <div className="mb-3 flex items-center justify-between">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
          <Plus className="h-3.5 w-3.5" />
          Weitere Widgets verfügbar
        </p>
        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
          {widgets.length} {widgets.length === 1 ? "Widget" : "Widgets"}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {widgets.map((w) => (
          <button
            key={w.key}
            type="button"
            onClick={() => onAdd(w.key)}
            className="group flex items-start gap-2 rounded-lg border border-gray-200 bg-white p-3 text-left transition hover:border-primary hover:shadow-sm dark:border-[#2c2c2e] dark:bg-[#1c1c1e]"
          >
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-primary group-hover:bg-primary/20">
              <Plus className="h-3 w-3" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{w.label}</p>
              <p className="truncate text-xs text-gray-500 dark:text-gray-400">{w.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
