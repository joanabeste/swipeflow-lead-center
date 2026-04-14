"use client";

import { useEffect, useRef, useState } from "react";
import { Filter } from "lucide-react";

export function SortableHeader({
  label,
  sortKey,
  currentSort,
  currentOrder,
  onSort,
  filterable = false,
  currentFilter = "",
  onFilter,
}: {
  label: string;
  sortKey: string;
  currentSort: string;
  currentOrder: string;
  onSort: (key: string) => void;
  filterable?: boolean;
  currentFilter?: string;
  onFilter?: (key: string, value: string) => void;
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
    <th className="relative px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
      <div className="flex items-center gap-1">
        <button
          onClick={() => onSort(sortKey)}
          className="hover:text-gray-700 dark:hover:text-gray-200"
        >
          {label}
          {currentSort === sortKey && (
            <span className="ml-1">{currentOrder === "asc" ? "↑" : "↓"}</span>
          )}
        </button>
        {filterable && onFilter && (
          <div className="relative" ref={ref}>
            <button
              onClick={() => setOpen((v) => !v)}
              className={`ml-0.5 rounded p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 ${
                currentFilter ? "text-primary" : "text-gray-400"
              }`}
            >
              <Filter className="h-3 w-3" />
            </button>
            {open && (
              <div className="absolute left-0 z-20 mt-1 w-48 rounded-md border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    onFilter(sortKey, (fd.get("value") as string) ?? "");
                    setOpen(false);
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
                      className="rounded bg-primary px-2 py-0.5 text-xs text-white hover:bg-primary-dark"
                    >
                      Filtern
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onFilter(sortKey, "");
                        setOpen(false);
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
    </th>
  );
}
