import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { LeadNoteAttachment, LoadedNoteAttachment } from "@/lib/types";
import {
  NOTE_ATTACHMENT_ALLOWED_MIMES,
  NOTE_ATTACHMENT_BUCKET,
  NOTE_ATTACHMENT_MAX_BYTES,
  sanitizeFileName,
  type NoteAttachmentUploadTicket,
  type UploadedAttachmentRef,
} from "./format";

export { NOTE_ATTACHMENT_BUCKET };
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

/**
 * Erzeugt fuer eine Liste angefragter Dateien signed Upload URLs. Der Browser laedt
 * dann via PUT direkt in den Bucket — Vercel-Function-Payload-Limit (4.5 MB) wird
 * dadurch umgangen.
 */
export async function createNoteAttachmentUploadTickets(params: {
  leadId: string;
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
    const path = `${params.leadId}/${crypto.randomUUID()}-${safeName}`;
    const { data, error } = await db.storage
      .from(NOTE_ATTACHMENT_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      const msg = /Bucket not found/i.test(error?.message ?? "")
        ? "Bucket lead-note-attachments fehlt — Migration 059 ausführen."
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

/**
 * Registriert eine bereits ueber Direct-Upload im Bucket liegende Datei als Anhang
 * einer Notiz. Verifiziert, dass das Storage-Object wirklich existiert und Groesse/MIME
 * konsistent sind — sonst Cleanup + Fehler.
 */
export async function registerNoteAttachment(params: {
  leadId: string;
  noteId: string;
  userId: string | null;
  ref: UploadedAttachmentRef;
}): Promise<{ attachment: LeadNoteAttachment } | { error: string }> {
  const v = validateMeta(params.ref);
  if (v) return { error: v };

  const db = createServiceClient();

  // Pfad-Sicherheit: der vom Client gemeldete Pfad MUSS unter {leadId}/ liegen.
  // Verhindert, dass jemand fremde Pfade als eigenen Anhang registriert.
  if (!params.ref.storagePath.startsWith(`${params.leadId}/`)) {
    return { error: "Ungueltiger Storage-Pfad." };
  }

  // Existenz-Check via list (createSignedUrl wuerde auch klappen, aber list ist billiger).
  const folder = params.ref.storagePath.split("/").slice(0, -1).join("/");
  const fileName = params.ref.storagePath.split("/").pop() ?? "";
  const { data: listing, error: listErr } = await db.storage
    .from(NOTE_ATTACHMENT_BUCKET)
    .list(folder, { limit: 1000, search: fileName });
  if (listErr) return { error: `Storage-Check fehlgeschlagen: ${listErr.message}` };
  const match = (listing ?? []).find((o) => o.name === fileName);
  if (!match) return { error: "Hochgeladene Datei nicht im Bucket gefunden." };

  const { data: row, error: insertErr } = await db
    .from("lead_note_attachments")
    .insert({
      note_id: params.noteId,
      lead_id: params.leadId,
      storage_path: params.ref.storagePath,
      file_name: params.ref.fileName,
      mime_type: params.ref.mimeType,
      size_bytes: params.ref.sizeBytes,
      created_by: params.userId,
    })
    .select()
    .single();

  if (insertErr || !row) {
    await db.storage.from(NOTE_ATTACHMENT_BUCKET).remove([params.ref.storagePath]);
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
