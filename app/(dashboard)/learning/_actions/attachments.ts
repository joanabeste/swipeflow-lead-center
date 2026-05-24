"use server";

import { checkLearningEditor } from "@/lib/auth";
import {
  createLessonAttachmentUploadTickets,
  deleteLessonAttachment as deleteAttachmentSrv,
  registerLessonAttachment,
} from "../_lib/attachments";
import type { LearningUploadTicket, LearningUploadedRef } from "../_lib/format";
import type { LearningLessonAttachment } from "@/lib/types";

export async function createLessonUploadTickets(input: {
  lessonId: string;
  files: { clientId: string; fileName: string; mimeType: string; sizeBytes: number }[];
}): Promise<
  | { tickets: LearningUploadTicket[]; errors: { clientId: string; error: string }[] }
  | { error: string }
> {
  const ctx = await checkLearningEditor();
  if (!ctx) return { error: "Keine Berechtigung." };
  return createLessonAttachmentUploadTickets(input);
}

export async function registerLessonUpload(input: {
  lessonId: string;
  ref: LearningUploadedRef;
}): Promise<{ attachment: LearningLessonAttachment } | { error: string }> {
  const ctx = await checkLearningEditor();
  if (!ctx) return { error: "Keine Berechtigung." };
  return registerLessonAttachment({ lessonId: input.lessonId, userId: ctx.user.id, ref: input.ref });
}

export async function deleteLessonAttachment(attachmentId: string): Promise<{ error?: string }> {
  const ctx = await checkLearningEditor();
  if (!ctx) return { error: "Keine Berechtigung." };
  return deleteAttachmentSrv(attachmentId);
}
