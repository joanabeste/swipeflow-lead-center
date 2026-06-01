"use client";

import { Film, Image as ImageIcon, Play } from "lucide-react";
import {
  FORMAT_LABELS,
  PLATFORM_LABELS,
  POST_STATUS_COLORS,
  POST_STATUS_LABELS,
  type Platform,
  type PostFormat,
  type PostStatus,
} from "@/lib/social/format";
import type { LoadedPostMedia } from "@/lib/social/types";

export function formatScheduled(scheduledAt: string | null): string {
  if (!scheduledAt) return "Kein Termin";
  try {
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(scheduledAt));
  } catch {
    return "Kein Termin";
  }
}

// lucide-react v1 enthält keine Marken-Icons mehr (Instagram/Facebook entfernt) —
// daher kompakte Text-Badges als Plattform-Kennzeichnung.
export function PlatformIcons({ platforms }: { platforms: Platform[] }) {
  if (!platforms || platforms.length === 0) {
    return <span className="text-[11px] text-gray-400">Keine Plattform</span>;
  }
  return (
    <span className="inline-flex items-center gap-1">
      {platforms.map((p) => (
        <span
          key={p}
          title={PLATFORM_LABELS[p]}
          className="inline-flex h-4 items-center rounded bg-gray-200 px-1 text-[9px] font-bold uppercase tracking-wide text-gray-600 dark:bg-white/15 dark:text-gray-300"
        >
          {p === "instagram" ? "IG" : "FB"}
        </span>
      ))}
    </span>
  );
}

export function StatusPill({ status }: { status: PostStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${POST_STATUS_COLORS[status]}`}>
      {POST_STATUS_LABELS[status]}
    </span>
  );
}

export function FormatBadge({ format }: { format: PostFormat }) {
  const Icon = format === "carousel" ? ImageIcon : format === "reel" || format === "video" ? Film : ImageIcon;
  return (
    <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300">
      <Icon className="h-3 w-3" /> {FORMAT_LABELS[format]}
    </span>
  );
}

/** Kompakte Cover-Vorschau (erstes Medium) für Board-/Listen-Karten. */
export function MediaThumb({ media, className = "" }: { media: LoadedPostMedia | undefined; className?: string }) {
  if (!media || !media.signed_url) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 text-gray-300 dark:bg-white/5 ${className}`}>
        <ImageIcon className="h-6 w-6" />
      </div>
    );
  }
  if (media.media_kind === "video") {
    return (
      <div className={`relative overflow-hidden bg-black ${className}`}>
        <video src={media.signed_url} preload="metadata" muted className="h-full w-full object-cover" />
        <span className="absolute inset-0 flex items-center justify-center">
          <Play className="h-6 w-6 text-white/90 drop-shadow" />
        </span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={media.signed_url} alt={media.file_name} className={`object-cover ${className}`} />
  );
}
