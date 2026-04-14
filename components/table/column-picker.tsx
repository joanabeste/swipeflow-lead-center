"use client";

import { useEffect, useRef, useState } from "react";
import { Columns3 } from "lucide-react";

export interface PickerColumn {
  key: string;
  label: string;
}

export function ColumnPicker({
  columns,
  visible,
  onToggle,
}: {
  columns: PickerColumn[];
  visible: string[];
  onToggle: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
      >
        <Columns3 className="h-4 w-4" />
        Spalten
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {columns.map((col) => (
            <label
              key={col.key}
              className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <input
                type="checkbox"
                checked={visible.includes(col.key)}
                onChange={() => onToggle(col.key)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              {col.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
