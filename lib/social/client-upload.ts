"use client";

import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import { SOCIAL_MEDIA_BUCKET, type SocialUploadTicket, type UploadedMediaRef } from "./format";

/**
 * Lädt eine Datei via signed Upload-URL direkt in den Supabase-Bucket.
 * Umgeht das Vercel-Function-Payload-Limit (~4.5 MB) — Pflicht für Videos.
 */
export async function uploadMediaToTicket(
  ticket: SocialUploadTicket,
  file: File,
): Promise<{ ref: UploadedMediaRef } | { error: string }> {
  const supabase = createBrowserSupabase();
  const { error } = await supabase.storage
    .from(SOCIAL_MEDIA_BUCKET)
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
