// Hilfsfunktionen rund um Datei-Anhänge an Notizen. Wird Server- wie Client-seitig
// genutzt — keine Server-only-Imports hier.

export const NOTE_ATTACHMENT_ALLOWED_MIMES: ReadonlySet<string> = new Set([
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
]);

export const NOTE_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024; // 25 MB
export const NOTE_ATTACHMENT_ACCEPT = Array.from(NOTE_ATTACHMENT_ALLOWED_MIMES).join(",");
export const NOTE_ATTACHMENT_BUCKET = "lead-note-attachments";

/** Metadaten einer bereits per Direct-Upload hochgeladenen Datei. Wird an die
 *  Server-Action geschickt — klein genug, um nicht ans Function-Payload-Limit zu stossen. */
export interface UploadedAttachmentRef {
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

/** Vom Server zurueckgegebenes Upload-Ticket fuer Direct-Upload via signed URL. */
export interface NoteAttachmentUploadTicket {
  clientId: string;
  storagePath: string;
  signedUrl: string;
  token: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

export function isPdfMime(mime: string): boolean {
  return mime === "application/pdf";
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
  const slug = base
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "datei";
  const cleanExt = ext.replace(/[^a-zA-Z0-9]+/g, "").slice(0, 8).toLowerCase();
  return cleanExt ? `${slug}.${cleanExt}` : slug;
}
