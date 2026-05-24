"use client";

import { ChevronUp, ChevronDown, Trash2 } from "lucide-react";

interface Props {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}

/**
 * Wrapper um jeden Block. Zeigt Hover-Actions (Reorder + Delete) und
 * ein dezentes Border-Highlight beim Hover.
 */
export function BlockFrame({ canMoveUp, canMoveDown, onMoveUp, onMoveDown, onDelete, children }: Props) {
  return (
    <div className="group relative">
      <div className="rounded-2xl border border-transparent transition group-hover:border-gray-200 group-hover:bg-gray-50/50 dark:group-hover:border-[#2c2c2e]/50 dark:group-hover:bg-white/[0.02]">
        <div className="px-4 py-3">{children}</div>
      </div>
      <div className="absolute right-2 top-2 hidden gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm group-hover:flex dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
        <ActionBtn disabled={!canMoveUp} onClick={onMoveUp} title="Nach oben">
          <ChevronUp className="h-3.5 w-3.5" />
        </ActionBtn>
        <ActionBtn disabled={!canMoveDown} onClick={onMoveDown} title="Nach unten">
          <ChevronDown className="h-3.5 w-3.5" />
        </ActionBtn>
        <ActionBtn onClick={onDelete} title="Löschen" danger>
          <Trash2 className="h-3.5 w-3.5" />
        </ActionBtn>
      </div>
    </div>
  );
}

function ActionBtn({
  children,
  disabled,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-md px-1.5 py-1 transition ${
        disabled
          ? "text-gray-300 dark:text-gray-700"
          : danger
            ? "text-gray-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            : "text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-white/5 dark:hover:text-gray-100"
      }`}
    >
      {children}
    </button>
  );
}
