"use client";

import { useState } from "react";
import { PlayCircle } from "lucide-react";
import { parseVideoUrl } from "../../_lib/format";
import type { LearningBlock } from "@/lib/types";

type VideoBlockData = Extract<LearningBlock, { type: "video" }>;

interface Props {
  block: VideoBlockData;
  onChange: (patch: Partial<Omit<VideoBlockData, "id" | "type">>) => void;
  autoFocus?: boolean;
}

export function VideoBlock({ block, onChange, autoFocus }: Props) {
  const [draftUrl, setDraftUrl] = useState(block.url);

  function commitUrl(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      onChange({ url: "", videoId: "", provider: "youtube" });
      return;
    }
    const parsed = parseVideoUrl(trimmed);
    if (!parsed) return;
    onChange({ url: trimmed, videoId: parsed.id, provider: parsed.provider });
  }

  const parsed = parseVideoUrl(draftUrl);
  const embedUrl =
    block.videoId && block.provider === "youtube"
      ? `https://www.youtube-nocookie.com/embed/${block.videoId}`
      : block.videoId && block.provider === "loom"
        ? `https://www.loom.com/embed/${block.videoId}`
        : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <PlayCircle className="h-4 w-4 shrink-0 text-gray-400" />
        <input
          autoFocus={autoFocus}
          value={draftUrl}
          onChange={(e) => setDraftUrl(e.target.value)}
          onBlur={(e) => commitUrl(e.target.value)}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text/plain");
            if (pasted) {
              setDraftUrl(pasted);
              setTimeout(() => commitUrl(pasted), 0);
            }
          }}
          placeholder="https://youtube.com/watch?v=… oder https://loom.com/share/…"
          className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e] dark:text-gray-100"
        />
        {parsed && (
          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase text-primary">
            {parsed.provider}
          </span>
        )}
      </div>
      {embedUrl ? (
        <div className="aspect-video w-full overflow-hidden rounded-xl border border-gray-200 bg-black dark:border-[#2c2c2e]/50">
          <iframe
            src={embedUrl}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : draftUrl.trim() && !parsed ? (
        <p className="rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300">
          URL nicht erkannt — nur YouTube und Loom werden unterstützt.
        </p>
      ) : (
        <p className="text-xs text-gray-400">URL einfügen oder paste — Video erscheint hier sofort.</p>
      )}
    </div>
  );
}
