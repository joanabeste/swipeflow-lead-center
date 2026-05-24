import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { sanitizeFileName } from "@/lib/notes/format";

export const EMAIL_ATTACHMENT_BUCKET = "email-attachments";
export const EMAIL_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export interface UploadEmailAttachmentInput {
  userId: string;
  threadId: string;
  imapUid: number | null | undefined;
  index: number;
  filename: string;
  buffer: Buffer;
  mimeType: string | null | undefined;
}

export interface UploadEmailAttachmentResult {
  storage_path: string | null;
  upload_error: string | null;
}

export async function uploadEmailAttachment(
  input: UploadEmailAttachmentInput,
): Promise<UploadEmailAttachmentResult> {
  if (input.buffer.length === 0) {
    return { storage_path: null, upload_error: "Datei ist leer." };
  }
  if (input.buffer.length > EMAIL_ATTACHMENT_MAX_BYTES) {
    return {
      storage_path: null,
      upload_error: `Datei zu groß (${(input.buffer.length / 1024 / 1024).toFixed(1)} MB, max 25 MB).`,
    };
  }

  const safeName = sanitizeFileName(input.filename || `anhang-${input.index}`);
  const uidPart = typeof input.imapUid === "number" ? `${input.imapUid}` : crypto.randomUUID();
  const path = `${input.userId}/${input.threadId}/${uidPart}-${input.index}-${safeName}`;

  const db = createServiceClient();
  const { error } = await db.storage.from(EMAIL_ATTACHMENT_BUCKET).upload(path, input.buffer, {
    contentType: input.mimeType || "application/octet-stream",
    upsert: false,
  });

  if (error) {
    // Already-exists ist OK (selbe Mail erneut gesynct): wir behalten den Pfad.
    if (/already exists|duplicate/i.test(error.message)) {
      return { storage_path: path, upload_error: null };
    }
    return { storage_path: null, upload_error: error.message };
  }

  return { storage_path: path, upload_error: null };
}

export async function getEmailAttachmentSignedUrl(
  path: string,
  expiresInSec = 3600,
): Promise<string | null> {
  const db = createServiceClient();
  const { data, error } = await db.storage
    .from(EMAIL_ATTACHMENT_BUCKET)
    .createSignedUrl(path, expiresInSec);
  if (error || !data) return null;
  return data.signedUrl;
}
