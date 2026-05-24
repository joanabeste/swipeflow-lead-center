import DOMPurify from "isomorphic-dompurify";

/**
 * Rendert das TipTap-HTML einer Lektion. iframes (YouTube/Loom) sind hier blockiert —
 * Videos laufen ueber das eigene <VideoEmbed/>-Modul mit kontrollierter Quelle.
 */
export function LessonRenderer({ html }: { html: string | null | undefined }) {
  if (!html) return null;
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["iframe", "script", "style"],
    FORBID_ATTR: ["onload", "onerror", "onclick"],
  });
  return (
    <div
      className="lesson-content max-w-none text-[15px] leading-relaxed text-gray-800 dark:text-gray-200"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
