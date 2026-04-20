"use client";

import { ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Klappbare Karte mit kontrolliertem open-State. Header ist klickbar,
 * Body wird nur gerendert wenn aufgeklappt. Die Overview-Kacheln setzen
 * `open` direkt, damit „Details" sofort das passende Panel aufklappt.
 */
export function CollapsibleCard({
  id,
  icon: Icon,
  title,
  subtitle,
  badge,
  open,
  onToggle,
  children,
}: {
  id?: string;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-20 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-5 py-4 text-left transition hover:bg-gray-50 dark:hover:bg-white/[0.02]"
      >
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{title}</h3>
            {badge}
          </div>
          {subtitle && (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
          )}
        </div>
        <ChevronDown
          className={`mt-1 h-4 w-4 shrink-0 text-gray-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <div className="border-t border-gray-100 px-5 py-5 dark:border-[#2c2c2e]">
          {children}
        </div>
      )}
    </section>
  );
}
