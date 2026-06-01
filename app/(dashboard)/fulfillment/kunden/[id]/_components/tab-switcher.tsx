"use client";

import Link from "next/link";

type Tab = "aktivitaeten" | "kontakte" | "projekte";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "projekte", label: "Projekte" },
  { id: "kontakte", label: "Kontakte" },
  { id: "aktivitaeten", label: "Aktivitäten" },
];

export function TabSwitcher({ current, basePath }: { current: Tab; basePath: string }) {
  return (
    <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#161618]">
      {TABS.map((t) => {
        const active = t.id === current;
        return (
          <Link
            key={t.id}
            href={`${basePath}?tab=${t.id}`}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${active ? "bg-primary text-gray-900 shadow-sm" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
