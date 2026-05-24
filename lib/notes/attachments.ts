import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { LeadNoteAttachment, LoadedNoteAttachment } from "@/lib/types";
import {
  NOTE_ATTACHMENT_ALLOWED_MIMES,
  NOTE_ATTACHMENT_MAX_BYTES,
  sanitizeFileName,
} from "./format";

export const NOTE_ATTACHMENT_BUCKET = "lead-note-attachments";

export interface NewAttachmentInput {
  /** "data:image/png;base64,…" */
  dataUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

function decodeDataUrl(dataUrl: string): { buffer: Buffer; mime: string } | { error: string } {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return { error: "Ungültiges Datei-Format (kein Base64-DataURL)." };
  try {
    return { buffer: Buffer.from(match[2], "base64"), mime: match[1] };
  } catch {
    return { error: "Datei konnte nicht dekodiert werden." };
  }
}

function validateInput(input: NewAttachmentInput): string | null {
  if (!NOTE_ATTACHMENT_ALLOWED_MIMES.has(input.mimeType)) {
    return `Dateityp ${input.mimeType || "unbekannt"} ist nicht erlaubt.`;
  }
  if (input.sizeBytes <= 0) return "Datei ist leer.";
  if (input.sizeBytes > NOTE_ATTACHMENT_MAX_BYTES) {
    return `Datei zu groß (max. ${NOTE_ATTACHMENT_MAX_BYTES / (1024 * 1024)} MB).`;
  }
  return null;
}

/**
 * Laedt einen einzelnen Anhang in den Bucket und schreibt die DB-Zeile.
 * Pfad: `{leadId}/{noteId}/{uuid}-{sanitized-filename}`.
 */
export async function uploadNoteAttachment(params: {
  leadId: string;
  noteId: string;
  userId: string | null;
  input: NewAttachmentInput;
}): Promise<{ attachment: LeadNoteAttachment } | { error: string }> {
  const validation = validateInput(params.input);
  if (validation) return { error: validation };

  const decoded = decodeDataUrl(params.input.dataUrl);
  if ("error" in decoded) return decoded;
  if (decoded.buffer.length > NOTE_ATTACHMENT_MAX_BYTES) {
    return { error: `Datei zu groß (max. ${NOTE_ATTACHMENT_MAX_BYTES / (1024 * 1024)} MB).` };
  }

  const db = createServiceClient();
  const safeName = sanitizeFileName(params.input.fileName);
  const path = `${params.leadId}/${params.noteId}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadErr } = await db.storage
    .from(NOTE_ATTACHMENT_BUCKET)
    .upload(path, decoded.buffer, {
      contentType: params.input.mimeType,
      upsert: false,
      cacheControl: "3600",
    });
  if (uploadErr) {
    if (/Bucket not found/i.test(uploadErr.message)) {
      return { error: "Bucket lead-note-attachments fehlt — Migration 059 ausführen." };
    }
    return { error: `Upload fehlgeschlagen: ${uploadErr.message}` };
  }

  const { data: row, error: insertErr } = await db
    .from("lead_note_attachments")
    .insert({
      note_id: params.noteId,
      lead_id: params.leadId,
      storage_path: path,
      file_name: params.input.fileName,
      mime_type: params.input.mimeType,
      size_bytes: decoded.buffer.length,
      created_by: params.userId,
    })
    .select()
    .single();

  if (insertErr || !row) {
    // Aufräumen: das soeben hochgeladene Object wieder entfernen.
    await db.storage.from(NOTE_ATTACHMENT_BUCKET).remove([path]);
    if (insertErr && /relation.*does not exist/i.test(insertErr.message)) {
      return { error: "Tabelle lead_note_attachments fehlt — Migration 059 ausführen." };
    }
    return { error: insertErr?.message ?? "Anhang konnte nicht gespeichert werden." };
  }

  return { attachment: row as LeadNoteAttachment };
}

/** Loescht einen Anhang inkl. Storage-Object. */
export async function deleteNoteAttachment(attachmentId: string): Promise<{ error?: string }> {
  const db = createServiceClient();
  const { data: row, error: selectErr } = await db
    .from("lead_note_attachments")
    .select("storage_path")
    .eq("id", attachmentId)
    .maybeSingle();
  if (selectErr) return { error: selectErr.message };
  if (!row) return {};

  const { error: storageErr } = await db.storage
    .from(NOTE_ATTACHMENT_BUCKET)
    .remove([row.storage_path as string]);
  if (storageErr) {
    // Storage-Fehler nicht hart fehlschlagen lassen — DB-Row trotzdem entfernen.
    console.warn("[deleteNoteAttachment] storage remove failed:", storageErr.message);
  }
  const { error: delErr } = await db
    .from("lead_note_attachments")
    .delete()
    .eq("id", attachmentId);
  if (delErr) return { error: delErr.message };
  return {};
}

/** Loescht alle Anhaenge einer Notiz (Storage + DB). DB-CASCADE saeubert die Rows zwar selbst,
 *  hier brauchen wir aber den Storage-Cleanup. */
export async function deleteAttachmentsForNote(noteId: string): Promise<void> {
  const db = createServiceClient();
  const { data: rows } = await db
    .from("lead_note_attachments")
    .select("storage_path")
    .eq("note_id", noteId);
  const paths = (rows ?? []).map((r) => r.storage_path as string).filter(Boolean);
  if (paths.length > 0) {
    const { error } = await db.storage.from(NOTE_ATTACHMENT_BUCKET).remove(paths);
    if (error) console.warn("[deleteAttachmentsForNote] storage remove failed:", error.message);
  }
  // DB-Rows entfernt das CASCADE beim Note-Delete; falls dieser Helper ohne Note-Delete
  // aufgerufen wird, hier explizit löschen.
  await db.from("lead_note_attachments").delete().eq("note_id", noteId);
}

/** Erzeugt eine signed URL für die UI-Anzeige eines Anhangs (Default 1 Stunde). */
export async function getNoteAttachmentSignedUrl(
  path: string,
  expiresInSec = 3600,
): Promise<string | null> {
  const db = createServiceClient();
  const { data, error } = await db.storage
    .from(NOTE_ATTACHMENT_BUCKET)
    .createSignedUrl(path, expiresInSec);
  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * Bulk-Fetch aller Anhänge zu einer Liste von Notiz-IDs, inkl. signed URLs.
 * Ergebnis ist nach `note_id` gruppiert.
 */
export async function getNoteAttachmentsForNotes(
  noteIds: string[],
): Promise<Map<string, LoadedNoteAttachment[]>> {
  const map = new Map<string, LoadedNoteAttachment[]>();
  if (noteIds.length === 0) return map;

  const db = createServiceClient();
  const { data: rows } = await db
    .from("lead_note_attachments")
    .select("id, note_id, storage_path, file_name, mime_type, size_bytes")
    .in("note_id", noteIds);
  if (!rows || rows.length === 0) return map;

  const signed = await Promise.all(
    rows.map(async (r) => {
      const url = await getNoteAttachmentSignedUrl(r.storage_path as string);
      return {
        id: r.id as string,
        note_id: r.note_id as string,
        file_name: r.file_name as string,
        mime_type: r.mime_type as string,
        size_bytes: r.size_bytes as number,
        signed_url: url,
      } satisfies LoadedNoteAttachment;
    }),
  );

  for (const a of signed) {
    const list = map.get(a.note_id) ?? [];
    list.push(a);
    map.set(a.note_id, list);
  }
  return map;
}
