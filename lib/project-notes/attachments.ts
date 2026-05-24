import "server-only";
// Spiegelt lib/notes/attachments.ts fuer projekt-Notizen.
// Bei Aenderungen hier auch dort pruefen (Lead-Notiz-Variante).
import { createServiceClient } from "@/lib/supabase/server";
import type { ProjectNoteAttachment, LoadedProjectNoteAttachment } from "@/lib/fulfillment/types";
import {
  NOTE_ATTACHMENT_ALLOWED_MIMES,
  NOTE_ATTACHMENT_MAX_BYTES,
  sanitizeFileName,
  type NoteAttachmentUploadTicket,
  type UploadedAttachmentRef,
} from "@/lib/notes/format";

export const PROJECT_NOTE_BUCKET = "project-note-attachments";
export type { NoteAttachmentUploadTicket, UploadedAttachmentRef };

function validateMeta(meta: { mimeType: string; sizeBytes: number }): string | null {
  if (!NOTE_ATTACHMENT_ALLOWED_MIMES.has(meta.mimeType)) {
    return `Dateityp ${meta.mimeType || "unbekannt"} ist nicht erlaubt.`;
  }
  if (meta.sizeBytes <= 0) return "Datei ist leer.";
  if (meta.sizeBytes > NOTE_ATTACHMENT_MAX_BYTES) {
    return `Datei zu groß (max. ${NOTE_ATTACHMENT_MAX_BYTES / (1024 * 1024)} MB).`;
  }
  return null;
}

export async function createProjectNoteAttachmentUploadTickets(params: {
  projectId: string;
  files: { clientId: string; fileName: string; mimeType: string; sizeBytes: number }[];
}): Promise<{ tickets: NoteAttachmentUploadTicket[]; errors: { clientId: string; error: string }[] }> {
  const db = createServiceClient();
  const tickets: NoteAttachmentUploadTicket[] = [];
  const errors: { clientId: string; error: string }[] = [];

  for (const f of params.files) {
    const v = validateMeta(f);
    if (v) {
      errors.push({ clientId: f.clientId, error: v });
      continue;
    }
    const safeName = sanitizeFileName(f.fileName);
    const path = `${params.projectId}/${crypto.randomUUID()}-${safeName}`;
    const { data, error } = await db.storage
      .from(PROJECT_NOTE_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      const msg = /Bucket not found/i.test(error?.message ?? "")
        ? `Bucket ${PROJECT_NOTE_BUCKET} fehlt — Migration 082 ausführen.`
        : (error?.message ?? "Upload-Ticket konnte nicht erzeugt werden.");
      errors.push({ clientId: f.clientId, error: msg });
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

export async function registerProjectNoteAttachment(params: {
  projectId: string;
  noteId: string;
  userId: string | null;
  ref: UploadedAttachmentRef;
}): Promise<{ attachment: ProjectNoteAttachment } | { error: string }> {
  const v = validateMeta(params.ref);
  if (v) return { error: v };

  const db = createServiceClient();

  if (!params.ref.storagePath.startsWith(`${params.projectId}/`)) {
    return { error: "Ungueltiger Storage-Pfad." };
  }

  const folder = params.ref.storagePath.split("/").slice(0, -1).join("/");
  const fileName = params.ref.storagePath.split("/").pop() ?? "";
  const { data: listing, error: listErr } = await db.storage
    .from(PROJECT_NOTE_BUCKET)
    .list(folder, { limit: 1000, search: fileName });
  if (listErr) return { error: `Storage-Check fehlgeschlagen: ${listErr.message}` };
  const match = (listing ?? []).find((o) => o.name === fileName);
  if (!match) return { error: "Hochgeladene Datei nicht im Bucket gefunden." };

  const { data: row, error: insertErr } = await db
    .from("project_note_attachments")
    .insert({
      note_id: params.noteId,
      project_id: params.projectId,
      storage_path: params.ref.storagePath,
      file_name: params.ref.fileName,
      mime_type: params.ref.mimeType,
      size_bytes: params.ref.sizeBytes,
      created_by: params.userId,
    })
    .select()
    .single();

  if (insertErr || !row) {
    await db.storage.from(PROJECT_NOTE_BUCKET).remove([params.ref.storagePath]);
    if (insertErr && /relation.*does not exist/i.test(insertErr.message)) {
      return { error: "Tabelle project_note_attachments fehlt — Migration 082 ausführen." };
    }
    return { error: insertErr?.message ?? "Anhang konnte nicht gespeichert werden." };
  }

  return { attachment: row as ProjectNoteAttachment };
}

export async function deleteProjectNoteAttachment(attachmentId: string): Promise<{ error?: string }> {
  const db = createServiceClient();
  const { data: row, error: selectErr } = await db
    .from("project_note_attachments")
    .select("storage_path")
    .eq("id", attachmentId)
    .maybeSingle();
  if (selectErr) return { error: selectErr.message };
  if (!row) return {};

  const { error: storageErr } = await db.storage
    .from(PROJECT_NOTE_BUCKET)
    .remove([row.storage_path as string]);
  if (storageErr) {
    console.warn("[deleteProjectNoteAttachment] storage remove failed:", storageErr.message);
  }
  const { error: delErr } = await db
    .from("project_note_attachments")
    .delete()
    .eq("id", attachmentId);
  if (delErr) return { error: delErr.message };
  return {};
}

export async function deleteAttachmentsForProjectNote(noteId: string): Promise<void> {
  const db = createServiceClient();
  const { data: rows } = await db
    .from("project_note_attachments")
    .select("storage_path")
    .eq("note_id", noteId);
  const paths = (rows ?? []).map((r) => r.storage_path as string).filter(Boolean);
  if (paths.length > 0) {
    const { error } = await db.storage.from(PROJECT_NOTE_BUCKET).remove(paths);
    if (error) console.warn("[deleteAttachmentsForProjectNote] storage remove failed:", error.message);
  }
  await db.from("project_note_attachments").delete().eq("note_id", noteId);
}

export async function getProjectNoteAttachmentSignedUrl(
  path: string,
  expiresInSec = 3600,
): Promise<string | null> {
  const db = createServiceClient();
  const { data, error } = await db.storage
    .from(PROJECT_NOTE_BUCKET)
    .createSignedUrl(path, expiresInSec);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function getProjectNoteAttachmentsForNotes(
  noteIds: string[],
): Promise<Map<string, LoadedProjectNoteAttachment[]>> {
  const map = new Map<string, LoadedProjectNoteAttachment[]>();
  if (noteIds.length === 0) return map;

  const db = createServiceClient();
  const { data: rows } = await db
    .from("project_note_attachments")
    .select("id, note_id, storage_path, file_name, mime_type, size_bytes")
    .in("note_id", noteIds);
  if (!rows || rows.length === 0) return map;

  const signed = await Promise.all(
    rows.map(async (r) => {
      const url = await getProjectNoteAttachmentSignedUrl(r.storage_path as string);
      return {
        id: r.id as string,
        note_id: r.note_id as string,
        file_name: r.file_name as string,
        mime_type: r.mime_type as string,
        size_bytes: r.size_bytes as number,
        signed_url: url,
      } satisfies LoadedProjectNoteAttachment;
    }),
  );

  for (const a of signed) {
    const list = map.get(a.note_id) ?? [];
    list.push(a);
    map.set(a.note_id, list);
  }
  return map;
}
