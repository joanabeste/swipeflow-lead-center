import DOMPurify from "isomorphic-dompurify";
import type { LoadedLearningAttachment } from "@/lib/types";
import { formatBytes } from "../_lib/format";

const ALLOWED_IFRAME_PREFIXES = [
  "https://www.youtube.com/embed/",
  "https://www.youtube-nocookie.com/embed/",
  "https://www.loom.com/embed/",
];

/**
 * Rendert das TipTap-HTML einer Lektion (Notion-Style Custom-Nodes).
 *
 * - iframes von YouTube/Loom sind via Allowlist erlaubt (alle anderen werden gestrippt)
 * - `<div data-learning-file>` Nodes werden serverseitig zu Download-Cards umgewandelt
 *   (mit signed URL aus `attachments`-Map)
 */
export function LessonRenderer({
  html,
  attachments = [],
}: {
  html: string | null | undefined;
  attachments?: LoadedLearningAttachment[];
}) {
  if (!html) return null;

  // 1) File-Blocks gegen HTML-Cards austauschen
  const withFiles = renderFileBlocks(html, attachments);

  // 2) Sanitize mit Iframe-Allowlist
  const clean = DOMPurify.sanitize(withFiles, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ["iframe"],
    ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "loading", "referrerpolicy"],
    FORBID_TAGS: ["script", "style"],
    FORBID_ATTR: ["onload", "onerror", "onclick"],
    // Validierung pro iframe: nur Whitelist-Quellen
    SANITIZE_DOM: true,
    ALLOW_DATA_ATTR: true,
  });

  // DOMPurify-Hook fuer iframe-Source-Validierung
  const cleanFiltered = filterIframes(clean);

  return (
    <div
      className="lesson-content max-w-none text-[15px] leading-relaxed text-gray-800 dark:text-gray-200"
      dangerouslySetInnerHTML={{ __html: cleanFiltered }}
    />
  );
}

function filterIframes(html: string): string {
  // Naiver, robuster Pass: jedes <iframe …src="…">…</iframe> mit src ausserhalb Allowlist
  // wird zu einem warnenden Platzhalter ersetzt.
  return html.replace(/<iframe([^>]*)>([\s\S]*?)<\/iframe>/gi, (match, attrs) => {
    const srcMatch = String(attrs).match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    const src = srcMatch?.[1] ?? "";
    if (ALLOWED_IFRAME_PREFIXES.some((p) => src.startsWith(p))) {
      // 16:9 wrap class + safety attrs
      return `<div class="aspect-video w-full overflow-hidden rounded-xl border border-gray-200 dark:border-[#2c2c2e]/50 my-3"><iframe${attrs} class="h-full w-full" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
    }
    return `<div class="rounded-xl bg-yellow-50 dark:bg-yellow-900/20 p-3 text-xs text-yellow-700 dark:text-yellow-300">Eingebettetes Element blockiert (nicht-vertrauenswürdige Quelle)</div>`;
  });
}

function renderFileBlocks(html: string, attachments: LoadedLearningAttachment[]): string {
  const byId = new Map(attachments.map((a) => [a.id, a]));
  return html.replace(
    /<div([^>]*?)data-learning-file([^>]*)>(?:[\s\S]*?)<\/div>/gi,
    (_match, before, after) => {
      const all = String(before) + String(after);
      const id = (all.match(/data-attachment-id\s*=\s*["']([^"']+)["']/) ?? [])[1];
      const fileName = (all.match(/data-file-name\s*=\s*["']([^"']+)["']/) ?? [])[1] ?? "Datei";
      const mimeType = (all.match(/data-mime-type\s*=\s*["']([^"']+)["']/) ?? [])[1] ?? "";
      const sizeBytes = Number((all.match(/data-size-bytes\s*=\s*["']([^"']+)["']/) ?? [])[1] ?? "0");
      const att = id ? byId.get(id) : undefined;
      const signedUrl = att?.signed_url ?? null;
      const sizeLabel = formatBytes(sizeBytes);
      const isImage = mimeType.startsWith("image/");
      const safeName = escapeHtml(fileName);
      if (isImage && signedUrl) {
        return `<div class="my-3"><img src="${escapeAttr(signedUrl)}" alt="${escapeAttr(fileName)}" class="mx-auto max-h-96 rounded-lg" /></div>`;
      }
      const ext = (fileName.split(".").pop() ?? "FILE").slice(0, 4).toUpperCase();
      const downloadAttr = signedUrl
        ? `href="${escapeAttr(signedUrl)}" target="_blank" rel="noopener noreferrer" download="${escapeAttr(fileName)}"`
        : `href="#" aria-disabled="true"`;
      return `<div class="my-3 flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-[#2c2c2e]/50 dark:bg-[#222224]">
  <div class="flex items-center gap-3">
    <span class="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">${escapeHtml(ext)}</span>
    <div>
      <p class="text-sm font-medium text-gray-900 dark:text-gray-100">${safeName}</p>
      <p class="text-xs text-gray-400">${sizeLabel}</p>
    </div>
  </div>
  <a ${downloadAttr} class="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white dark:border-[#2c2c2e]/50 dark:text-gray-300 dark:hover:bg-white/5">Öffnen</a>
</div>`;
    },
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
