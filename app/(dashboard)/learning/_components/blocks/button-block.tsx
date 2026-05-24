"use client";

import { ArrowRight } from "lucide-react";
import type { LearningBlock } from "@/lib/types";

type ButtonBlockData = Extract<LearningBlock, { type: "button" }>;

interface Props {
  block: ButtonBlockData;
  onChange: (patch: Partial<Omit<ButtonBlockData, "id" | "type">>) => void;
  autoFocus?: boolean;
}

const URL_PATTERN = /^(?:https?:\/\/|mailto:|tel:)/i;

export function ButtonBlock({ block, onChange, autoFocus }: Props) {
  const urlOk = !block.url || URL_PATTERN.test(block.url);
  const previewLabel = block.label.trim() || "Vorschau";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="block text-[11px] font-medium text-gray-500 dark:text-gray-400">Label</span>
          <input
            autoFocus={autoFocus}
            defaultValue={block.label}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== block.label) onChange({ label: v });
            }}
            placeholder='z.B. „Jetzt anfragen"'
            className="mt-1 block w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e] dark:text-gray-100"
          />
        </label>
        <label className="block">
          <span className="block text-[11px] font-medium text-gray-500 dark:text-gray-400">Ziel-URL</span>
          <input
            defaultValue={block.url}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== block.url) onChange({ url: v });
            }}
            placeholder="https://… oder mailto:…"
            className={`mt-1 block w-full rounded-lg border bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-1 dark:bg-[#1c1c1e] dark:text-gray-100 ${
              urlOk
                ? "border-gray-200 focus:border-primary focus:ring-primary dark:border-[#2c2c2e]/50"
                : "border-red-300 focus:border-red-500 focus:ring-red-500"
            }`}
          />
          {!urlOk && (
            <span className="mt-0.5 block text-[10px] text-red-500">
              URL muss mit http://, https://, mailto: oder tel: anfangen.
            </span>
          )}
        </label>
      </div>
      <div className="flex justify-center pt-1">
        <span className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm">
          {previewLabel}
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}
