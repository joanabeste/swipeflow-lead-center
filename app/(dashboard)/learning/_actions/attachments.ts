"use server";

import { revalidatePath } from "next/cache";
import { checkLearningEditor } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import {
  createLessonAttachmentUploadTickets,
  deleteLessonAttachment as deleteAttachmentSrv,
  registerLessonAttachment,
} from "../_lib/attachments";
import { LEARNING_COVER_BUCKET } from "../_lib/format";
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

/** Drag-Reorder der Anhaenge einer Lektion (sort_order). */
export async function reorderLessonAttachments(input: {
  lessonId: string;
  attachmentIds: string[];
}): Promise<{ error?: string }> {
  const ctx = await checkLearningEditor();
  if (!ctx) return { error: "Keine Berechtigung." };
  const db = createServiceClient();
  for (let i = 0; i < input.attachmentIds.length; i++) {
    const { error } = await db
      .from("learning_lesson_attachments")
      .update({ sort_order: i })
      .eq("id", input.attachmentIds[i])
      .eq("lesson_id", input.lessonId);
    if (error) return { error: error.message };
  }
  return {};
}

/** Datei-Namen einer Anhang-Datei aendern (z.B. fuer Lesbarkeit in der Liste). */
export async function renameLessonAttachment(input: {
  attachmentId: string;
  fileName: string;
}): Promise<{ error?: string }> {
  const ctx = await checkLearningEditor();
  if (!ctx) return { error: "Keine Berechtigung." };
  const trimmed = input.fileName.trim();
  if (!trimmed) return { error: "Name darf nicht leer sein." };
  const db = createServiceClient();
  const { error } = await db
    .from("learning_lesson_attachments")
    .update({ file_name: trimmed })
    .eq("id", input.attachmentId);
  if (error) return { error: error.message };
  return {};
}

// ─── Cover-Image ─────────────────────────────────────────────────

/** Cover-Image-Upload als data-URL (JPEG, klein) via Service-Role.
 *  Speichert in learning-covers (public) und schreibt Pfad in courses.cover_image_path. */
export async function uploadCourseCover(input: {
  courseId: string;
  /** data:image/jpeg;base64,… — vom Client (cropped JPEG, max ~500 KB). */
  dataUrl: string;
}): Promise<{ path: string } | { error: string }> {
  const ctx = await checkLearningEditor();
  if (!ctx) return { error: "Keine Berechtigung." };

  const match = input.dataUrl.match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/);
  if (!match) return { error: "Ungueltiges Bild-Format." };
  const mime = match[1];
  const ext = match[2] === "jpeg" ? "jpg" : match[2];
  const buffer = Buffer.from(match[3], "base64");
  if (buffer.length > 5 * 1024 * 1024) return { error: "Bild zu groß (max. 5 MB)." };

  const db = createServiceClient();
  const path = `${input.courseId}/cover-${Date.now()}.${ext}`;
  const { error: upErr } = await db.storage
    .from(LEARNING_COVER_BUCKET)
    .upload(path, buffer, { contentType: mime, upsert: false });
  if (upErr) return { error: upErr.message };

  // Alten Cover-Path holen, ueberschreiben, alten loeschen.
  const { data: course } = await db
    .from("learning_courses")
    .select("cover_image_path")
    .eq("id", input.courseId)
    .maybeSingle();
  const { error: updErr } = await db
    .from("learning_courses")
    .update({ cover_image_path: path })
    .eq("id", input.courseId);
  if (updErr) {
    await db.storage.from(LEARNING_COVER_BUCKET).remove([path]);
    return { error: updErr.message };
  }
  if (course?.cover_image_path && course.cover_image_path !== path) {
    await db.storage.from(LEARNING_COVER_BUCKET).remove([course.cover_image_path as string]);
  }

  revalidatePath("/learning");
  revalidatePath(`/learning/admin/${input.courseId}`);
  return { path };
}

/** Cover-Image entfernen. */
export async function removeCourseCover(courseId: string): Promise<{ error?: string }> {
  const ctx = await checkLearningEditor();
  if (!ctx) return { error: "Keine Berechtigung." };
  const db = createServiceClient();
  const { data: course } = await db
    .from("learning_courses")
    .select("cover_image_path")
    .eq("id", courseId)
    .maybeSingle();
  if (course?.cover_image_path) {
    await db.storage.from(LEARNING_COVER_BUCKET).remove([course.cover_image_path as string]);
  }
  const { error } = await db
    .from("learning_courses")
    .update({ cover_image_path: null })
    .eq("id", courseId);
  if (error) return { error: error.message };
  revalidatePath("/learning");
  revalidatePath(`/learning/admin/${courseId}`);
  return {};
}

