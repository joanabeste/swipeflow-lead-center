"use client";

import { MessageSquare } from "lucide-react";
import type { PostWithMedia } from "@/lib/social/types";
import { FormatBadge, MediaThumb, PlatformIcons, StatusPill, formatScheduled } from "./post-ui";

export function ListView({ posts, onEdit }: { posts: PostWithMedia[]; onEdit: (p: PostWithMedia) => void }) {
  // Geplante zuerst (nach Termin), Posts ohne Termin ans Ende.
  const sorted = [...posts].sort((a, b) => {
    if (!a.scheduled_at && !b.scheduled_at) return 0;
    if (!a.scheduled_at) return 1;
    if (!b.scheduled_at) return -1;
    return a.scheduled_at.localeCompare(b.scheduled_at);
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-[#2c2c2e]/60">
      <ul className="divide-y divide-gray-100 dark:divide-[#2c2c2e]/50">
        {sorted.map((p) => {
          const preview = p.title?.trim() || p.caption.trim() || "Ohne Titel";
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onEdit(p)}
                className="flex w-full items-center gap-3 bg-white px-3 py-2.5 text-left transition hover:bg-gray-50 dark:bg-[#161618] dark:hover:bg-white/5"
              >
                <MediaThumb media={p.media[0]} className="h-11 w-11 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{preview}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <FormatBadge format={p.format} />
                    <PlatformIcons platforms={p.platforms} />
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">{formatScheduled(p.scheduled_at)}</span>
                  </div>
                </div>
                {p.comment_count > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                    <MessageSquare className="h-3.5 w-3.5" /> {p.comment_count}
                  </span>
                )}
                <StatusPill status={p.status} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
