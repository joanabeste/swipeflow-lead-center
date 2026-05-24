"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { LearningBlockType } from "@/lib/types";
import { BlockAddBar } from "./block-add-bar";

/**
 * Diskreter „+"-Button zwischen 2 Blöcken. Erscheint auf Hover der Gap.
 * Klick öffnet ein Popover mit den 5 Block-Tiles.
 */
export function BlockAddInline({ onAdd }: { onAdd: (type: LearningBlockType) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="group/inline relative -my-1 flex h-6 items-center justify-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex h-5 w-5 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 transition hover:border-primary hover:text-primary dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e] ${
          open ? "opacity-100" : "opacity-0 group-hover/inline:opacity-100"
        }`}
        title="Block hier einfügen"
      >
        <Plus className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute left-1/2 top-full z-20 mt-1 w-72 -translate-x-1/2">
          <BlockAddBar
            variant="popover"
            onAdd={(type) => {
              setOpen(false);
              onAdd(type);
            }}
          />
        </div>
      )}
    </div>
  );
}
