"use client";

import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import type { NoteAttachmentUploadTicket, UploadedAttachmentRef } from "@/lib/notes/format";

const BUCKET = "project-note-attachments";

export async function uploadProjectAttachmentToTicket(
  ticket: NoteAttachmentUploadTicket,
  file: File,
): Promise<{ ref: UploadedAttachmentRef } | { error: string }> {
  const supabase = createBrowserSupabase();
  const { error } = await supabase.storage
    .from(BUCKET)
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
