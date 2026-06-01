// Konstanten + reine Helfer rund um Social-Media-Postings. Wird Server- wie
// Client-seitig genutzt — KEINE server-only-Imports hier.

export type Platform = "instagram" | "facebook";
export type PostFormat = "feed_single" | "carousel" | "reel" | "story" | "video";
export type MediaKind = "image" | "video";
export type PostStatus =
  | "draft"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "publishing"
  | "published"
  | "failed"
  | "archived";

export const SOCIAL_MEDIA_BUCKET = "social-media";

export const SOCIAL_IMAGE_MAX_BYTES = 25 * 1024 * 1024; // 25 MB
export const SOCIAL_VIDEO_MAX_BYTES = 200 * 1024 * 1024; // 200 MB (= Bucket-Limit)

export const SOCIAL_IMAGE_MIMES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const SOCIAL_VIDEO_MIMES: ReadonlySet<string> = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export const SOCIAL_ALLOWED_MIMES: ReadonlySet<string> = new Set([
  ...SOCIAL_IMAGE_MIMES,
  ...SOCIAL_VIDEO_MIMES,
]);

export const SOCIAL_ACCEPT = Array.from(SOCIAL_ALLOWED_MIMES).join(",");

// ─── Plattformen ────────────────────────────────────────────────────────────

export const PLATFORMS: readonly Platform[] = ["instagram", "facebook"];

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
};

/** Maximale Caption-Länge je Plattform (für den Zeichenzähler im Editor). */
export const CAPTION_MAX: Record<Platform, number> = {
  instagram: 2200,
  facebook: 63206,
};

// ─── Formate ────────────────────────────────────────────────────────────────

export const POST_FORMATS: readonly PostFormat[] = [
  "feed_single",
  "carousel",
  "reel",
  "story",
  "video",
];

export const FORMAT_LABELS: Record<PostFormat, string> = {
  feed_single: "Feed-Beitrag",
  carousel: "Carousel",
  reel: "Reel",
  story: "Story",
  video: "Video",
};

// ─── Status ─────────────────────────────────────────────────────────────────

export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  draft: "Entwurf",
  in_review: "In Freigabe",
  changes_requested: "Änderung erbeten",
  approved: "Freigegeben",
  publishing: "Wird veröffentlicht",
  published: "Veröffentlicht",
  failed: "Fehlgeschlagen",
  archived: "Archiviert",
};

export const POST_STATUS_COLORS: Record<PostStatus, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300",
  in_review: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  changes_requested: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  approved: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  publishing: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  published: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  archived: "bg-gray-200 text-gray-600 dark:bg-white/5 dark:text-gray-500",
};

/** In v1 im Board sichtbare/wählbare Status-Spalten (ohne Auto-Posting-Reserve). */
export const BOARD_STATUSES: readonly PostStatus[] = [
  "draft",
  "in_review",
  "changes_requested",
  "approved",
  "published",
  "archived",
];

/** In v1 vom Team manuell wählbare Status (publishing/failed setzt nur der Worker). */
export const SELECTABLE_STATUSES: readonly PostStatus[] = [
  "draft",
  "in_review",
  "changes_requested",
  "approved",
  "published",
  "archived",
];

/** Status, die auf dem öffentlichen Kunden-Freigabelink sichtbar sind. */
export const CLIENT_VISIBLE_STATUSES: readonly PostStatus[] = [
  "in_review",
  "changes_requested",
  "approved",
];

// ─── Upload-Typen (analog lib/notes/format.ts) ──────────────────────────────

/** Metadaten einer bereits per Direct-Upload hochgeladenen Datei. */
export interface UploadedMediaRef {
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

/** Vom Server zurückgegebenes Upload-Ticket für Direct-Upload via signed URL. */
export interface SocialUploadTicket {
  clientId: string;
  storagePath: string;
  signedUrl: string;
  token: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

// ─── Helfer ─────────────────────────────────────────────────────────────────

export function isImageMime(mime: string): boolean {
  return SOCIAL_IMAGE_MIMES.has(mime);
}

export function isVideoMime(mime: string): boolean {
  return SOCIAL_VIDEO_MIMES.has(mime);
}

export function mediaKindForMime(mime: string): MediaKind | null {
  if (SOCIAL_IMAGE_MIMES.has(mime)) return "image";
  if (SOCIAL_VIDEO_MIMES.has(mime)) return "video";
  return null;
}

export function maxBytesForMime(mime: string): number {
  return isVideoMime(mime) ? SOCIAL_VIDEO_MAX_BYTES : SOCIAL_IMAGE_MAX_BYTES;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** Macht aus einem beliebigen Dateinamen einen sicheren Slug für den Storage-Pfad. */
export function sanitizeFileName(name: string): string {
  const lastDot = name.lastIndexOf(".");
  const base = lastDot > 0 ? name.slice(0, lastDot) : name;
  const ext = lastDot > 0 ? name.slice(lastDot + 1) : "";
  const slug =
    base
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "datei";
  const cleanExt = ext.replace(/[^a-zA-Z0-9]+/g, "").slice(0, 8).toLowerCase();
  return cleanExt ? `${slug}.${cleanExt}` : slug;
}

/**
 * Prüft, ob die Medien-Zusammenstellung zum gewählten Format passt.
 * Gibt einen Fehlertext zurück oder null, wenn alles ok ist. Wird client- UND
 * server-seitig verwendet.
 */
export function validateMediaForFormat(
  format: PostFormat,
  media: { media_kind: MediaKind }[],
): string | null {
  const images = media.filter((m) => m.media_kind === "image").length;
  const videos = media.filter((m) => m.media_kind === "video").length;
  const total = media.length;

  switch (format) {
    case "feed_single":
      if (total !== 1 || images !== 1) return "Feed-Beitrag braucht genau 1 Bild.";
      return null;
    case "carousel":
      if (videos > 0) return "Carousel enthält nur Bilder.";
      if (images < 2 || images > 10) return "Carousel braucht 2 bis 10 Bilder.";
      return null;
    case "reel":
    case "video":
      if (total !== 1 || videos !== 1) return `${FORMAT_LABELS[format]} braucht genau 1 Video.`;
      return null;
    case "story":
      if (total !== 1) return "Story braucht genau 1 Medium (Bild oder Video).";
      return null;
    default:
      return null;
  }
}
