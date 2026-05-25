"use client";

import { Type, PlayCircle, Paperclip, Image as ImageIcon, MousePointer2, Sparkles } from "lucide-react";
import type { LearningBlockType } from "@/lib/types";

/** Spezial-Trigger fuer KI-Text-Generation (kein echter Block-Typ). */
export type BlockAddTrigger = LearningBlockType | "ai";

export const BLOCK_TILES: Array<{
  type: BlockAddTrigger;
  label: string;
  hint: string;
  icon: typeof Type;
}> = [
  { type: "text", label: "Text", hint: "Fließtext", icon: Type },
  { type: "video", label: "Video", hint: "YouTube / Loom", icon: PlayCircle },
  { type: "file", label: "Datei", hint: "PDF, Office, etc.", icon: Paperclip },
  { type: "image", label: "Bild", hint: "Inline-Bild", icon: ImageIcon },
  { type: "button", label: "Button", hint: "CTA-Link", icon: MousePointer2 },
  { type: "ai", label: "KI-Text", hint: "Inhalt schreiben lassen", icon: Sparkles },
];

interface Props {
  onAdd: (type: BlockAddTrigger) => void;
  variant?: "bar" | "popover";
  title?: string;
}

/**
 * 5-Tile-Bar zum Block-Hinzufügen.
 * - variant="bar": große permanente Bar (am Ende der Block-Liste)
 * - variant="popover": kompakter Modus für Inline-Popover (zwischen Blöcken)
 */
export function BlockAddBar({ onAdd, variant = "bar", title }: Props) {
  if (variant === "popover") {
    return (
      <div className="grid grid-cols-6 gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-lg dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
        {BLOCK_TILES.map((t) => (
          <button
            key={t.type}
            type="button"
            onClick={() => onAdd(t.type)}
            title={t.label}
            className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-[10px] text-gray-600 transition hover:bg-primary/10 hover:text-primary dark:text-gray-400"
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 p-4 dark:border-[#2c2c2e]/50 dark:bg-white/[0.02]">
      {title && (
        <p className="text-center text-xs font-semibold uppercase tracking-wider text-gray-400">
          {title}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {BLOCK_TILES.map((t) => (
          <button
            key={t.type}
            type="button"
            onClick={() => onAdd(t.type)}
            className="group flex flex-col items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-3 text-xs font-medium text-gray-700 transition hover:-translate-y-0.5 hover:border-primary hover:bg-primary/5 hover:text-primary hover:shadow-md dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e] dark:text-gray-300"
          >
            <t.icon className="h-5 w-5 text-gray-400 transition group-hover:text-primary" />
            <span>{t.label}</span>
            <span className="text-[10px] font-normal text-gray-400">{t.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
