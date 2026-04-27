"use client";

import { useEffect, useRef, useState } from "react";
import { Columns3, RotateCcw } from "lucide-react";

export interface PickerColumn {
  key: string;
  label: string;
}

export function ColumnPicker({
  columns,
  visible,
  onToggle,
  onReset,
}: {
  columns: PickerColumn[];
  visible: string[];
  onToggle: (key: string) => void;
  /** Wenn gesetzt, rendert das Dropdown einen "Auf Standard zurücksetzen"-Button. */
  onReset?: () => void;
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
          {onReset && (
            <>
              <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
              <button
                type="button"
                onClick={() => {
                  onReset();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Auf Standard zurücksetzen
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
