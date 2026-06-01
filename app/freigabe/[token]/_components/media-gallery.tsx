"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { LoadedPostMedia } from "@/lib/social/types";

export function MediaGallery({ media }: { media: LoadedPostMedia[] }) {
  const [index, setIndex] = useState(0);
  if (media.length === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-gray-100 text-sm text-gray-400 dark:bg-white/5">
        Kein Medium
      </div>
    );
  }

  const current = media[Math.min(index, media.length - 1)];
  const multiple = media.length > 1;

  return (
    <div className="relative overflow-hidden rounded-xl bg-black">
      <div className="flex aspect-square w-full items-center justify-center">
        {current.media_kind === "video" ? (
          <video src={current.signed_url ?? undefined} controls preload="metadata" className="h-full w-full object-contain" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.signed_url ?? undefined} alt={current.file_name} className="h-full w-full object-contain" />
        )}
      </div>

      {multiple && (
        <>
          <button
            type="button"
            onClick={() => setIndex((i) => (i - 1 + media.length) % media.length)}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"
            aria-label="Vorheriges Medium"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setIndex((i) => (i + 1) % media.length)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"
            aria-label="Nächstes Medium"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
            {media.map((m, i) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Medium ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === index ? "w-4 bg-white" : "w-1.5 bg-white/50"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
