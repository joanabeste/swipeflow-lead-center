import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { LearningLessonAttachment, LoadedLearningAttachment } from "@/lib/types";
import {
  LEARNING_ATTACHMENT_ALLOWED_MIMES,
  LEARNING_ATTACHMENT_BUCKET,
  LEARNING_ATTACHMENT_MAX_BYTES,
  sanitizeFileName,
  type LearningUploadTicket,
  type LearningUploadedRef,
} from "./format";

function validateMeta(meta: { mimeType: string; sizeBytes: number }): string | null {
  if (!LEARNING_ATTACHMENT_ALLOWED_MIMES.has(meta.mimeType)) {
    return `Dateityp ${meta.mimeType || "unbekannt"} ist nicht erlaubt.`;
  }
  if (meta.sizeBytes <= 0) return "Datei ist leer.";
  if (meta.sizeBytes > LEARNING_ATTACHMENT_MAX_BYTES) {
    return `Datei zu groß (max. ${LEARNING_ATTACHMENT_MAX_BYTES / (1024 * 1024)} MB).`;
  }
  return null;
}

export async function createLessonAttachmentUploadTickets(params: {
  lessonId: string;
  files: { clientId: string; fileName: string; mimeType: string; sizeBytes: number }[];
}): Promise<{ tickets: LearningUploadTicket[]; errors: { clientId: string; error: string }[] }> {
  const db = createServiceClient();
  const tickets: LearningUploadTicket[] = [];
  const errors: { clientId: string; error: string }[] = [];

  for (const f of params.files) {
    const v = validateMeta(f);
    if (v) {
      errors.push({ clientId: f.clientId, error: v });
      continue;
    }
    const safeName = sanitizeFileName(f.fileName);
    const path = `${params.lessonId}/${crypto.randomUUID()}-${safeName}`;
    const { data, error } = await db.storage
      .from(LEARNING_ATTACHMENT_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      errors.push({
        clientId: f.clientId,
        error: error?.message ?? "Upload-Ticket konnte nicht erzeugt werden.",
      });
      continue;
    }
    tickets.push({
      clientId: f.clientId,
      storagePath: data.path,
      signedUrl: data.signedUrl,
      token: data.token,
      fileName: f.fileName,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
    });
  }
  return { tickets, errors };
}

export async function registerLessonAttachment(params: {
  lessonId: string;
  userId: string | null;
  ref: LearningUploadedRef;
}): Promise<{ attachment: LearningLessonAttachment } | { error: string }> {
  const v = validateMeta(params.ref);
  if (v) return { error: v };

  const db = createServiceClient();

  if (!params.ref.storagePath.startsWith(`${params.lessonId}/`)) {
    return { error: "Ungültiger Storage-Pfad." };
  }

  const folder = params.ref.storagePath.split("/").slice(0, -1).join("/");
  const fileName = params.ref.storagePath.split("/").pop() ?? "";
  const { data: listing, error: listErr } = await db.storage
    .from(LEARNING_ATTACHMENT_BUCKET)
    .list(folder, { limit: 1000, search: fileName });
  if (listErr) return { error: `Storage-Check fehlgeschlagen: ${listErr.message}` };
  const match = (listing ?? []).find((o) => o.name === fileName);
  if (!match) return { error: "Hochgeladene Datei nicht im Bucket gefunden." };

  const { data: row, error: insertErr } = await db
    .from("learning_lesson_attachments")
    .insert({
      lesson_id: params.lessonId,
      storage_path: params.ref.storagePath,
      file_name: params.ref.fileName,
      mime_type: params.ref.mimeType,
      size_bytes: params.ref.sizeBytes,
      uploaded_by: params.userId,
    })
    .select()
    .single();

  if (insertErr || !row) {
    await db.storage.from(LEARNING_ATTACHMENT_BUCKET).remove([params.ref.storagePath]);
    return { error: insertErr?.message ?? "Anhang konnte nicht gespeichert werden." };
  }
  return { attachment: row as LearningLessonAttachment };
}

export async function deleteLessonAttachment(attachmentId: string): Promise<{ error?: string }> {
  const db = createServiceClient();
  const { data: row, error: selectErr } = await db
    .from("learning_lesson_attachments")
    .select("storage_path")
    .eq("id", attachmentId)
    .maybeSingle();
  if (selectErr) return { error: selectErr.message };
  if (!row) return {};

  const { error: storageErr } = await db.storage
    .from(LEARNING_ATTACHMENT_BUCKET)
    .remove([row.storage_path as string]);
  if (storageErr) console.warn("[deleteLessonAttachment] storage remove failed:", storageErr.message);

  const { error: delErr } = await db.from("learning_lesson_attachments").delete().eq("id", attachmentId);
  if (delErr) return { error: delErr.message };
  return {};
}

export async function getLessonAttachmentSignedUrl(path: string, expiresInSec = 3600): Promise<string | null> {
  const db = createServiceClient();
  const { data, error } = await db.storage
    .from(LEARNING_ATTACHMENT_BUCKET)
    .createSignedUrl(path, expiresInSec);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function getAttachmentsForLessons(
  lessonIds: string[],
): Promise<Map<string, LoadedLearningAttachment[]>> {
  const map = new Map<string, LoadedLearningAttachment[]>();
  if (lessonIds.length === 0) return map;

  const db = createServiceClient();
  const { data: rows } = await db
    .from("learning_lesson_attachments")
    .select("id, lesson_id, storage_path, file_name, mime_type, size_bytes")
    .in("lesson_id", lessonIds);
  if (!rows || rows.length === 0) return map;

  const signed = await Promise.all(
    rows.map(async (r) => {
      const url = await getLessonAttachmentSignedUrl(r.storage_path as string);
      return {
        id: r.id as string,
        lesson_id: r.lesson_id as string,
        file_name: r.file_name as string,
        mime_type: r.mime_type as string,
        size_bytes: r.size_bytes as number,
        signed_url: url,
      } satisfies LoadedLearningAttachment;
    }),
  );

  for (const a of signed) {
    const list = map.get(a.lesson_id) ?? [];
    list.push(a);
    map.set(a.lesson_id, list);
  }
  return map;
}
