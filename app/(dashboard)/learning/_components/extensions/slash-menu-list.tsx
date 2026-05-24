"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { SlashCommand } from "./slash-menu-types";
import { GROUP_LABELS } from "./slash-menu-types";

export interface SlashMenuListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface Props {
  items: SlashCommand[];
  command: (item: SlashCommand) => void;
}

/**
 * Floating Slash-Menu UI. Wird von Tippy positioniert.
 * Items werden gruppiert nach `group` angezeigt. Pfeil-Navigation + Enter selektiert.
 */
export const SlashMenuList = forwardRef<SlashMenuListHandle, Props>(function SlashMenuList(
  { items, command },
  ref,
) {
  const [selected, setSelected] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Reset selection wenn sich items ändern (z.B. anderer Filter-String)
  useEffect(() => {
    setSelected(0);
  }, [items]);

  // Scroll selected ins Viewport
  useEffect(() => {
    const el = scrollerRef.current?.querySelector<HTMLElement>(`[data-slash-idx="${selected}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  function pick(idx: number) {
    const it = items[idx];
    if (it) command(it);
  }

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowDown") {
        setSelected((i) => (i + 1) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === "ArrowUp") {
        setSelected((i) => (i - 1 + items.length) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === "Enter") {
        pick(selected);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="w-72 rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-400 shadow-xl dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
        Keine Treffer
      </div>
    );
  }

  // Items in Gruppen aufteilen, in fester Reihenfolge
  const groupOrder: SlashCommand["group"][] = ["inhalt", "medien", "ki"];
  const grouped: Record<string, { item: SlashCommand; absoluteIdx: number }[]> = {};
  items.forEach((it, idx) => {
    const arr = grouped[it.group] ?? [];
    arr.push({ item: it, absoluteIdx: idx });
    grouped[it.group] = arr;
  });

  return (
    <div
      ref={scrollerRef}
      className="max-h-80 w-72 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]"
    >
      {groupOrder
        .filter((g) => grouped[g]?.length)
        .map((g) => (
          <div key={g} className="py-1">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              {GROUP_LABELS[g]}
            </p>
            {grouped[g].map(({ item, absoluteIdx }) => {
              const isSel = absoluteIdx === selected;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-slash-idx={absoluteIdx}
                  onMouseEnter={() => setSelected(absoluteIdx)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(absoluteIdx);
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition ${
                    isSel
                      ? "bg-primary/10 text-primary"
                      : "text-gray-700 dark:text-gray-300"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                      isSel ? "bg-primary/20" : "bg-gray-100 dark:bg-[#222224]"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{item.title}</span>
                    {item.hint && (
                      <span className="block text-[10px] text-gray-400">{item.hint}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
    </div>
  );
});
