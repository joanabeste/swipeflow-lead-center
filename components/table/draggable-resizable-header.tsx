"use client";

import { useEffect, useRef, useState } from "react";
import { Filter, GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const MIN_WIDTH = 60;
const MAX_WIDTH = 800;

export function DraggableResizableHeader({
  columnKey,
  label,
  currentSort,
  currentOrder,
  onSort,
  filterable = false,
  currentFilter = "",
  onFilter,
  onResize,
}: {
  columnKey: string;
  label: string;
  currentSort: string;
  currentOrder: string;
  onSort: (key: string) => void;
  filterable?: boolean;
  currentFilter?: string;
  onFilter?: (key: string, value: string) => void;
  /** Wird beim pointerup mit der finalen Breite gerufen. */
  onResize: (key: string, width: number) => void;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const thRef = useRef<HTMLTableCellElement>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: columnKey });

  // Filter-Popup schliessen bei Outside-Klick.
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Resize via Pointer-Events. Globale Listener auf document, damit der Drag
  // auch ausserhalb des Th-Bereichs verfolgt wird.
  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = thRef.current?.getBoundingClientRect().width ?? 120;

    const onMove = (ev: PointerEvent) => {
      const delta = ev.clientX - startX;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
      // Live-Feedback: setzt die Width direkt am <col> via key-suffix Lookup.
      // Single Source of Truth bleibt der Hook — wir spiegeln nur live.
      const colEl = document.querySelector<HTMLTableColElement>(
        `col[data-col-key="${columnKey}"]`,
      );
      if (colEl) colEl.style.width = `${next}px`;
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const delta = ev.clientX - startX;
      const final = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
      onResize(columnKey, final);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <th
      ref={(node) => {
        setNodeRef(node);
        thRef.current = node;
      }}
      style={style}
      className="group relative px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
    >
      <div className="flex items-center gap-1">
        {/* Drag-Handle: nur bei Hover sichtbar, damit das UI ruhig bleibt. */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Spalte verschieben"
          className="-ml-1 cursor-grab rounded p-0.5 text-gray-300 opacity-0 transition group-hover:opacity-100 hover:text-gray-500 active:cursor-grabbing dark:text-gray-600 dark:hover:text-gray-400"
        >
          <GripVertical className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => onSort(columnKey)}
          className="hover:text-gray-700 dark:hover:text-gray-200"
        >
          {label}
          {currentSort === columnKey && (
            <span className="ml-1">{currentOrder === "asc" ? "↑" : "↓"}</span>
          )}
        </button>
        {filterable && onFilter && (
          <div className="relative" ref={filterRef}>
            <button
              type="button"
              onClick={() => setFilterOpen((v) => !v)}
              className={`ml-0.5 rounded p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 ${
                currentFilter ? "text-primary" : "text-gray-400"
              }`}
            >
              <Filter className="h-3 w-3" />
            </button>
            {filterOpen && (
              <div className="absolute left-0 z-20 mt-1 w-48 rounded-md border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    onFilter(columnKey, (fd.get("value") as string) ?? "");
                    setFilterOpen(false);
                  }}
                >
                  <input
                    name="value"
                    type="text"
                    defaultValue={currentFilter}
                    placeholder={`${label} enthält…`}
                    autoFocus
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-600 dark:bg-[#2c2c2e] dark:text-gray-100"
                  />
                  <div className="mt-1.5 flex gap-1">
                    <button
                      type="submit"
                      className="rounded bg-primary px-2 py-0.5 text-xs text-gray-900 hover:bg-primary-dark"
                    >
                      Filtern
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onFilter(columnKey, "");
                        setFilterOpen(false);
                      }}
                      className="rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      Löschen
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}
      </div>
      {/* Resize-Edge: 4px breite Grab-Zone am rechten Rand. */}
      <span
        onPointerDown={startResize}
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none bg-transparent hover:bg-primary/40"
        aria-hidden
      />
    </th>
  );
}
