"use client";

import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import {
  LEARNING_ATTACHMENT_BUCKET,
  LEARNING_COVER_BUCKET,
  type LearningUploadTicket,
  type LearningUploadedRef,
} from "./format";

export async function uploadFileToLearningTicket(
  ticket: LearningUploadTicket,
  file: File,
  bucket: typeof LEARNING_ATTACHMENT_BUCKET | typeof LEARNING_COVER_BUCKET = LEARNING_ATTACHMENT_BUCKET,
): Promise<{ ref: LearningUploadedRef } | { error: string }> {
  const supabase = createBrowserSupabase();
  const { error } = await supabase.storage
    .from(bucket)
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
