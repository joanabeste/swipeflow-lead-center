// Konstanten + reine Helper fuer Learning-Anhaenge und Video-URLs.
// Wird Server- wie Client-seitig genutzt — KEIN server-only-Import hier.

import type { LearningVideoProvider } from "@/lib/types";

export const LEARNING_ATTACHMENT_BUCKET = "learning-attachments";
export const LEARNING_COVER_BUCKET = "learning-covers";

export const LEARNING_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

export const LEARNING_ATTACHMENT_ALLOWED_MIMES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "video/mp4",
  "video/webm",
]);

export const LEARNING_ATTACHMENT_ACCEPT = Array.from(LEARNING_ATTACHMENT_ALLOWED_MIMES).join(",");

export const LEARNING_COVER_MAX_BYTES = 5 * 1024 * 1024;
export const LEARNING_COVER_ALLOWED_MIMES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export interface LearningUploadTicket {
  clientId: string;
  storagePath: string;
  signedUrl: string;
  token: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface LearningUploadedRef {
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export function sanitizeFileName(name: string): string {
  const lastDot = name.lastIndexOf(".");
  const base = lastDot > 0 ? name.slice(0, lastDot) : name;
  const ext = lastDot > 0 ? name.slice(lastDot + 1) : "";
  const slug = base
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "datei";
  const cleanExt = ext.replace(/[^a-zA-Z0-9]+/g, "").slice(0, 8).toLowerCase();
  return cleanExt ? `${slug}.${cleanExt}` : slug;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "kurs";
}

// ─── Video-URL-Parser ────────────────────────────────────────────

export interface ParsedVideo {
  provider: LearningVideoProvider;
  embedUrl: string;
  id: string;
}

export function parseVideoUrl(input: string | null | undefined): ParsedVideo | null {
  if (!input) return null;
  const url = input.trim();
  if (!url) return null;

  // YouTube
  const ytWatch = url.match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{6,})/);
  if (ytWatch) {
    return { provider: "youtube", id: ytWatch[1], embedUrl: `https://www.youtube.com/embed/${ytWatch[1]}` };
  }

  // Loom
  const loom = url.match(/loom\.com\/(?:share|embed)\/([A-Za-z0-9]{8,})/);
  if (loom) {
    return { provider: "loom", id: loom[1], embedUrl: `https://www.loom.com/embed/${loom[1]}` };
  }

  return null;
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

export function isPdfMime(mime: string): boolean {
  return mime === "application/pdf";
}

export function isVideoMime(mime: string): boolean {
  return mime.startsWith("video/");
}
