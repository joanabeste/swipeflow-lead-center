import DOMPurify from "isomorphic-dompurify";
import type { LearningBlock } from "@/lib/types";
import { formatBytes } from "../_lib/format";
import { ArrowRight } from "lucide-react";

interface Props {
  blocks: LearningBlock[];
  /** Map attachmentId → signed URL (vom Server-Loader vorgeladen). */
  signedUrls: Map<string, string | null>;
}

/**
 * Rendert V4 Block-Stack-Lessons im Student-View.
 * Signed-URLs für Image/File-Blöcke werden vom Caller bereitgestellt.
 */
export function BlockRenderer({ blocks, signedUrls }: Props) {
  return (
    <div className="space-y-6">
      {blocks.map((b) => (
        <BlockView key={b.id} block={b} signedUrls={signedUrls} />
      ))}
    </div>
  );
}

function BlockView({
  block,
  signedUrls,
}: {
  block: LearningBlock;
  signedUrls: Map<string, string | null>;
}) {
  if (block.type === "text") {
    const clean = DOMPurify.sanitize(block.html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ["iframe", "script", "style"],
    });
    return (
      <div
        className="lesson-content max-w-none text-[15px] leading-relaxed text-gray-800 dark:text-gray-200"
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    );
  }

  if (block.type === "video") {
    const embedUrl =
      block.provider === "youtube"
        ? `https://www.youtube-nocookie.com/embed/${block.videoId}`
        : `https://www.loom.com/embed/${block.videoId}`;
    return (
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
    );
  }

  if (block.type === "image") {
    const url = signedUrls.get(block.attachmentId) ?? null;
    return (
      <figure className="space-y-1">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={block.caption ?? block.fileName} className="mx-auto max-h-[480px] rounded-xl" />
        ) : (
          <div className="flex aspect-video items-center justify-center rounded-xl bg-gray-100 text-gray-400 dark:bg-[#1c1c1e]">
            Bild nicht verfügbar
          </div>
        )}
        {block.caption && (
          <figcaption className="text-center text-xs text-gray-500 dark:text-gray-400">{block.caption}</figcaption>
        )}
      </figure>
    );
  }

  if (block.type === "file") {
    const url = signedUrls.get(block.attachmentId) ?? null;
    const ext = (block.fileName.split(".").pop() ?? "FILE").slice(0, 4).toUpperCase();
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 dark:border-[#2c2c2e]/50 dark:bg-[#222224]">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
            {ext}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{block.fileName}</p>
            <p className="text-xs text-gray-400">{formatBytes(block.sizeBytes)}</p>
          </div>
        </div>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            download={block.fileName}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white dark:border-[#2c2c2e]/50 dark:text-gray-300 dark:hover:bg-white/5"
          >
            Öffnen
          </a>
        )}
      </div>
    );
  }

  if (block.type === "button") {
    if (!block.url || !block.label) return null;
    return (
      <div className="flex justify-center py-2">
        <a
          href={block.url}
          target={block.url.startsWith("http") ? "_blank" : undefined}
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-primary-dark"
        >
          {block.label}
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    );
  }

  return null;
}
