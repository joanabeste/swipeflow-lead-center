"use client";

import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import {
  NOTE_ATTACHMENT_BUCKET,
  type NoteAttachmentUploadTicket,
  type UploadedAttachmentRef,
} from "./format";

/**
 * Laedt eine Datei via signed Upload-URL direkt in den Supabase-Bucket.
 * Umgeht das Vercel-Function-Payload-Limit von ~4.5 MB.
 */
export async function uploadFileToTicket(
  ticket: NoteAttachmentUploadTicket,
  file: File,
): Promise<{ ref: UploadedAttachmentRef } | { error: string }> {
  const supabase = createBrowserSupabase();
  const { error } = await supabase.storage
    .from(NOTE_ATTACHMENT_BUCKET)
    .uploadToSignedUrl(ticket.storagePath, ticket.token, file, {
      contentType: ticket.mimeType,
      upsert: false,
    });
  if (error) return { error: error.message };
  return {
    ref: {
      storagePath: ticket.storagePath,
      fileName: ticket.fileName,
      mimeType: ticket.mimeType,
      sizeBytes: ticket.sizeBytes,
    },
  };
}
