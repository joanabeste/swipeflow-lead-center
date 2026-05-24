"use server";

import { revalidatePath } from "next/cache";
import { checkLearningEditor } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import type {
  LearningBlock,
  LearningCategory,
  LearningCourse,
  LearningCourseStatus,
  LearningModule,
  LearningLesson,
  LearningLessonType,
  LearningVideoProvider,
} from "@/lib/types";
import { parseVideoUrl, slugify } from "../_lib/format";

// ─── Kategorien ──────────────────────────────────────────────────

export async function createCategory(input: {
  name: string;
  description?: string;
  icon?: string;
}): Promise<{ category: LearningCategory } | { error: string }> {
  const ctx = await checkLearningEditor();
  if (!ctx) return { error: "Keine Berechtigung." };
  if (!input.name.trim()) return { error: "Name fehlt." };

  const db = createServiceClient();
  const baseSlug = slugify(input.name);
  let slug = baseSlug;
  for (let i = 2; i < 50; i++) {
    const { data: existing } = await db.from("learning_categories").select("id").eq("slug", slug).maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${i}`;
  }

  const { data, error } = await db
    .from("learning_categories")
    .insert({
      name: input.name.trim(),
      slug,
      description: input.description?.trim() || null,
      icon: input.icon?.trim() || null,
    })
    .select()
    .single();
  if (error || !data) return { error: error?.message ?? "Konnte Kategorie nicht anlegen." };
  revalidatePath("/learning");
  revalidatePath("/learning/admin/kategorien");
  return { category: data as LearningCategory };
}

export async function updateCategory(input: {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  sort_order?: number;
}): Promise<{ error?: string }> {
  const ctx = await checkLearningEditor();
  if (!ctx) return { error: "Keine Berechtigung." };
  const db = createServiceClient();
  const { error } = await db
    .from("learning_categories")
    .update({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      icon: input.icon?.trim() || null,
      sort_order: input.sort_order,
    })
    .eq("id", input.id);
  if (error) return { error: error.message };
  revalidatePath("/learning");
  revalidatePath("/learning/admin/kategorien");
  return {};
}

export async function deleteCategory(id: string): Promise<{ error?: string }> {
  const ctx = await checkLearningEditor();
  if (!ctx) return { error: "Keine Berechtigung." };
  const db = createServiceClient();
  const { error } = await db.from("learning_categories").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/learning");
  revalidatePath("/learning/admin/kategorien");
  return {};
}

// ─── Kurse ───────────────────────────────────────────────────────

export async function createCourse(input: {
  title: string;
  category_id?: string | null;
  summary?: string;
}): Promise<{ course: LearningCourse } | { error: string }> {
  const ctx = await checkLearningEditor();
  if (!ctx) return { error: "Keine Berechtigung." };
  if (!input.title.trim()) return { error: "Titel fehlt." };

  const db = createServiceClient();
  const baseSlug = slugify(input.title);
  let slug = baseSlug;
  for (let i = 2; i < 50; i++) {
    const { data: existing } = await db.from("learning_courses").select("id").eq("slug", slug).maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${i}`;
  }

  const { data, error } = await db
    .from("learning_courses")
    .insert({
      title: input.title.trim(),
      slug,
      category_id: input.category_id ?? null,
      summary: input.summary?.trim() || null,
      status: "draft",
      created_by: ctx.user.id,
    })
    .select()
    .single();
  if (error || !data) return { error: error?.message ?? "Konnte Kurs nicht anlegen." };
  revalidatePath("/learning");
  revalidatePath("/learning/admin");
  return { course: data as LearningCourse };
}

export async function updateCourse(input: {
  id: string;
  title?: string;
  summary?: string | null;
  category_id?: string | null;
  status?: LearningCourseStatus;
  cover_image_path?: string | null;
  sort_order?: number;
  learning_objectives?: string[];
}): Promise<{ error?: string }> {
  const ctx = await checkLearningEditor();
  if (!ctx) return { error: "Keine Berechtigung." };
  const db = createServiceClient();
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.summary !== undefined) patch.summary = input.summary?.trim() || null;
  if (input.category_id !== undefined) patch.category_id = input.category_id;
  if (input.status !== undefined) patch.status = input.status;
  if (input.cover_image_path !== undefined) patch.cover_image_path = input.cover_image_path;
  if (input.sort_order !== undefined) patch.sort_order = input.sort_order;
  if (input.learning_objectives !== undefined) {
    patch.learning_objectives = input.learning_objectives
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const { error } = await db.from("learning_courses").update(patch).eq("id", input.id);
  if (error) return { error: error.message };
  revalidatePath("/learning");
  revalidatePath("/learning/admin");
  revalidatePath(`/learning/admin/${input.id}`);
  return {};
}

export async function deleteCourse(id: string): Promise<{ error?: string }> {
  const ctx = await checkLearningEditor();
  if (!ctx) return { error: "Keine Berechtigung." };
  const db = createServiceClient();
  const { error } = await db.from("learning_courses").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/learning");
  revalidatePath("/learning/admin");
  return {};
}

// ─── Module ──────────────────────────────────────────────────────

export async function createModule(input: {
  course_id: string;
  title: string;
}): Promise<{ module: LearningModule } | { error: string }> {
  const ctx = await checkLearningEditor();
  if (!ctx) return { error: "Keine Berechtigung." };
  if (!input.title.trim()) return { error: "Titel fehlt." };

  const db = createServiceClient();
  const { data: maxRow } = await db
    .from("learning_modules")
    .select("sort_order")
    .eq("course_id", input.course_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data, error } = await db
    .from("learning_modules")
    .insert({ course_id: input.course_id, title: input.title.trim(), sort_order: nextOrder })
    .select()
    .single();
  if (error || !data) return { error: error?.message ?? "Konnte Modul nicht anlegen." };
  revalidatePath(`/learning/admin/${input.course_id}`);
  return { module: data as LearningModule };
}

export async function updateModule(input: {
  id: string;
  title?: string;
  description?: string | null;
  sort_order?: number;
}): Promise<{ error?: string }> {
  const ctx = await checkLearningEditor();
  if (!ctx) return { error: "Keine Berechtigung." };
  const db = createServiceClient();
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.sort_order !== undefined) patch.sort_order = input.sort_order;
  const { error } = await db.from("learning_modules").update(patch).eq("id", input.id);
  if (error) return { error: error.message };
  return {};
}

export async function deleteModule(id: string): Promise<{ error?: string }> {
  const ctx = await checkLearningEditor();
  if (!ctx) return { error: "Keine Berechtigung." };
  const db = createServiceClient();
  const { error } = await db.from("learning_modules").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}

// ─── Lektionen ───────────────────────────────────────────────────

export async function createLesson(input: {
  module_id: string;
  title: string;
  lesson_type?: LearningLessonType;
}): Promise<{ lesson: LearningLesson } | { error: string }> {
  const ctx = await checkLearningEditor();
  if (!ctx) return { error: "Keine Berechtigung." };
  if (!input.title.trim()) return { error: "Titel fehlt." };

  const db = createServiceClient();
  const { data: maxRow } = await db
    .from("learning_lessons")
    .select("sort_order")
    .eq("module_id", input.module_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data, error } = await db
    .from("learning_lessons")
    .insert({
      module_id: input.module_id,
      title: input.title.trim(),
      lesson_type: input.lesson_type ?? "mixed",
      sort_order: nextOrder,
      created_by: ctx.user.id,
    })
    .select()
    .single();
  if (error || !data) return { error: error?.message ?? "Konnte Lektion nicht anlegen." };
  return { lesson: data as LearningLesson };
}

export async function updateLesson(input: {
  id: string;
  title?: string;
  content_html?: string | null;
  video_url?: string | null;
  estimated_minutes?: number | null;
  sort_order?: number;
  lesson_type?: LearningLessonType;
  summary?: string | null;
  editor_notes?: string | null;
  module_id?: string;
  /** V4 Block-Stack (Migration 092). */
  blocks?: LearningBlock[];
}): Promise<{ error?: string }> {
  const ctx = await checkLearningEditor();
  if (!ctx) return { error: "Keine Berechtigung." };
  const db = createServiceClient();
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.content_html !== undefined) patch.content_html = input.content_html;
  if (input.estimated_minutes !== undefined) patch.estimated_minutes = input.estimated_minutes;
  if (input.sort_order !== undefined) patch.sort_order = input.sort_order;
  if (input.lesson_type !== undefined) patch.lesson_type = input.lesson_type;
  if (input.summary !== undefined) patch.summary = input.summary?.trim() || null;
  if (input.editor_notes !== undefined) patch.editor_notes = input.editor_notes?.trim() || null;
  if (input.module_id !== undefined) patch.module_id = input.module_id;
  if (input.blocks !== undefined) patch.blocks = input.blocks;
  if (input.video_url !== undefined) {
    const url = input.video_url?.trim() || null;
    let provider: LearningVideoProvider | null = null;
    if (url) {
      const parsed = parseVideoUrl(url);
      if (!parsed) return { error: "Video-URL nicht erkannt (nur YouTube und Loom unterstützt)." };
      provider = parsed.provider;
    }
    patch.video_url = url;
    patch.video_provider = provider;
  }
  const { error } = await db.from("learning_lessons").update(patch).eq("id", input.id);
  if (error) return { error: error.message };
  return {};
}

/** Lektion in anderes Modul verschieben (Cross-Modul-Move per Drag-Drop). */
export async function moveLesson(input: {
  lessonId: string;
  targetModuleId: string;
  sortOrder: number;
}): Promise<{ error?: string }> {
  const ctx = await checkLearningEditor();
  if (!ctx) return { error: "Keine Berechtigung." };
  const db = createServiceClient();
  const { error } = await db
    .from("learning_lessons")
    .update({ module_id: input.targetModuleId, sort_order: input.sortOrder })
    .eq("id", input.lessonId);
  if (error) return { error: error.message };
  return {};
}

/** Lektion duplizieren (inkl. Anhaenge — Storage-Copy via signedUrl + neuer Upload). */
export async function duplicateLesson(lessonId: string): Promise<{ lesson: LearningLesson } | { error: string }> {
  const ctx = await checkLearningEditor();
  if (!ctx) return { error: "Keine Berechtigung." };
  const db = createServiceClient();
  const { data: src, error: getErr } = await db
    .from("learning_lessons")
    .select("*")
    .eq("id", lessonId)
    .maybeSingle();
  if (getErr || !src) return { error: getErr?.message ?? "Lektion nicht gefunden." };

  const { data: maxRow } = await db
    .from("learning_lessons")
    .select("sort_order")
    .eq("module_id", src.module_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data: inserted, error: insErr } = await db
    .from("learning_lessons")
    .insert({
      module_id: src.module_id,
      title: `${src.title} (Kopie)`,
      lesson_type: src.lesson_type,
      summary: src.summary,
      editor_notes: src.editor_notes,
      content_html: src.content_html,
      video_url: src.video_url,
      video_provider: src.video_provider,
      estimated_minutes: src.estimated_minutes,
      sort_order: nextOrder,
      created_by: ctx.user.id,
    })
    .select()
    .single();
  if (insErr || !inserted) return { error: insErr?.message ?? "Duplizieren fehlgeschlagen." };

  // Anhaenge kopieren — Storage-Objekte mittels copy() im selben Bucket.
  const { data: attachments } = await db
    .from("learning_lesson_attachments")
    .select("*")
    .eq("lesson_id", lessonId)
    .order("sort_order");
  if (attachments && attachments.length > 0) {
    for (const a of attachments) {
      const newPath = `${inserted.id}/${crypto.randomUUID()}-${a.file_name.replace(/[^a-zA-Z0-9._-]+/g, "-")}`;
      const { error: copyErr } = await db.storage
        .from("learning-attachments")
        .copy(a.storage_path as string, newPath);
      if (copyErr) {
        console.warn("[duplicateLesson] storage copy failed:", copyErr.message);
        continue;
      }
      await db.from("learning_lesson_attachments").insert({
        lesson_id: inserted.id,
        storage_path: newPath,
        file_name: a.file_name,
        mime_type: a.mime_type,
        size_bytes: a.size_bytes,
        sort_order: a.sort_order,
        uploaded_by: ctx.user.id,
      });
    }
  }

  return { lesson: inserted as LearningLesson };
}

/** Modul mit allen Lektionen (inkl. Anhaengen) duplizieren. */
export async function duplicateModule(moduleId: string): Promise<{ module: LearningModule } | { error: string }> {
  const ctx = await checkLearningEditor();
  if (!ctx) return { error: "Keine Berechtigung." };
  const db = createServiceClient();
  const { data: src, error: getErr } = await db
    .from("learning_modules")
    .select("*")
    .eq("id", moduleId)
    .maybeSingle();
  if (getErr || !src) return { error: getErr?.message ?? "Modul nicht gefunden." };

  const { data: maxRow } = await db
    .from("learning_modules")
    .select("sort_order")
    .eq("course_id", src.course_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data: newMod, error: insErr } = await db
    .from("learning_modules")
    .insert({
      course_id: src.course_id,
      title: `${src.title} (Kopie)`,
      description: src.description,
      sort_order: nextOrder,
    })
    .select()
    .single();
  if (insErr || !newMod) return { error: insErr?.message ?? "Duplizieren fehlgeschlagen." };

  const { data: lessons } = await db
    .from("learning_lessons")
    .select("id")
    .eq("module_id", moduleId)
    .order("sort_order");
  for (const l of lessons ?? []) {
    // duplicate-lesson laesst die Kopie im selben (alten) Modul; danach umhaengen.
    const dup = await duplicateLesson(l.id as string);
    if ("lesson" in dup) {
      await db.from("learning_lessons").update({ module_id: newMod.id }).eq("id", dup.lesson.id);
    }
  }

  return { module: newMod as LearningModule };
}

export async function deleteLesson(id: string): Promise<{ error?: string }> {
  const ctx = await checkLearningEditor();
  if (!ctx) return { error: "Keine Berechtigung." };
  const db = createServiceClient();
  const { error } = await db.from("learning_lessons").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}

/** Drag&Drop: neue Reihenfolge der Module/Lektionen speichern. */
export async function reorderItems(input: {
  kind: "module" | "lesson";
  ids: string[];
}): Promise<{ error?: string }> {
  const ctx = await checkLearningEditor();
  if (!ctx) return { error: "Keine Berechtigung." };
  const db = createServiceClient();
  const table = input.kind === "module" ? "learning_modules" : "learning_lessons";
  for (let i = 0; i < input.ids.length; i++) {
    const { error } = await db.from(table).update({ sort_order: i }).eq("id", input.ids[i]);
    if (error) return { error: error.message };
  }
  return {};
}

/** Bulk-Reorder der Lektionen pro Modul (z.B. nach Drag-Drop mit Cross-Modul-Move).
 *  groups: Map module_id → ordered lesson-ids. Setzt sort_order + module_id atomar. */
export async function reorderLessonsAcrossModules(input: {
  groups: { moduleId: string; lessonIds: string[] }[];
}): Promise<{ error?: string }> {
  const ctx = await checkLearningEditor();
  if (!ctx) return { error: "Keine Berechtigung." };
  const db = createServiceClient();
  for (const g of input.groups) {
    for (let i = 0; i < g.lessonIds.length; i++) {
      const { error } = await db
        .from("learning_lessons")
        .update({ module_id: g.moduleId, sort_order: i })
        .eq("id", g.lessonIds[i]);
      if (error) return { error: error.message };
    }
  }
  return {};
}

// ─── V4 Legacy-Konversion ──────────────────────────────────────────
//
// Parsed alte content_html (TipTap-HTML mit data-Attrs fuer YouTube/Loom/FileBlock)
// in die neue Block-Stack-Struktur. Lesson.content_html bleibt als Backup erhalten.

/** Konvertiert content_html einer Lesson in Block-Array. */
export async function convertLegacyToBlocks(
  lessonId: string,
): Promise<{ blocks: LearningBlock[] } | { error: string }> {
  const ctx = await checkLearningEditor();
  if (!ctx) return { error: "Keine Berechtigung." };
  const db = createServiceClient();
  const { data: lesson, error: getErr } = await db
    .from("learning_lessons")
    .select("id, content_html")
    .eq("id", lessonId)
    .maybeSingle();
  if (getErr || !lesson) return { error: getErr?.message ?? "Lektion nicht gefunden." };
  const html = (lesson.content_html as string | null) ?? "";

  // Anhänge der Lesson holen — File/Image-Bloecke brauchen storage_path
  const { data: atts } = await db
    .from("learning_lesson_attachments")
    .select("id, storage_path, file_name, mime_type, size_bytes")
    .eq("lesson_id", lessonId);
  type AttRow = {
    id: string;
    storage_path: string;
    file_name: string;
    mime_type: string;
    size_bytes: number;
  };
  const attMap = new Map<string, AttRow>(
    ((atts ?? []) as unknown as AttRow[]).map((a) => [a.id, a]),
  );

  const blocks = parseHtmlToBlocks(html, attMap);
  const { error: updErr } = await db
    .from("learning_lessons")
    .update({ blocks })
    .eq("id", lessonId);
  if (updErr) return { error: updErr.message };
  return { blocks };
}

/** Best-effort HTML → Block[] Parser. Server-side; nutzt simple Regex/RegExp da
 *  unser content_html deterministisch von TipTap kommt. Bei unbekanntem Markup
 *  wird der ganze Rest in einen Text-Block gepackt. */
function parseHtmlToBlocks(
  html: string,
  attMap: Map<string, { id: string; storage_path: string; file_name: string; mime_type: string; size_bytes: number }>,
): LearningBlock[] {
  if (!html.trim()) return [];

  const blocks: LearningBlock[] = [];
  let textBuffer = "";
  const newId = () => crypto.randomUUID();

  function flushText() {
    const stripped = textBuffer.replace(/<[^>]*>/g, "").trim();
    if (stripped.length > 0) {
      blocks.push({ id: newId(), type: "text", html: textBuffer });
    }
    textBuffer = "";
  }

  // Splittet das HTML in Top-Level-Knoten via regex die unsere bekannten
  // Custom-Node-Container findet. Alles dazwischen ist Text/normales HTML.
  const pattern =
    /<div\s+[^>]*?(data-youtube-video|data-loom-id|data-learning-file)[^>]*?>(?:[\s\S]*?)<\/div>/gi;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html)) !== null) {
    const before = html.slice(lastIndex, m.index);
    if (before.trim()) textBuffer += before;
    flushText();

    const matched = m[0];
    const which = m[1].toLowerCase();
    if (which === "data-youtube-video") {
      const src = (matched.match(/<iframe[^>]+src=["']([^"']+)["']/i) ?? [])[1] ?? "";
      const idMatch = src.match(/\/embed\/([A-Za-z0-9_-]{6,})/);
      const videoId = idMatch?.[1] ?? "";
      if (videoId) {
        blocks.push({
          id: newId(),
          type: "video",
          provider: "youtube",
          videoId,
          url: `https://www.youtube.com/watch?v=${videoId}`,
        });
      } else {
        textBuffer += matched; // unparseable -> als Text behalten
        flushText();
      }
    } else if (which === "data-loom-id") {
      const idMatch = matched.match(/data-loom-id\s*=\s*["']([A-Za-z0-9]+)["']/i);
      const videoId = idMatch?.[1] ?? "";
      if (videoId) {
        blocks.push({
          id: newId(),
          type: "video",
          provider: "loom",
          videoId,
          url: `https://www.loom.com/share/${videoId}`,
        });
      } else {
        textBuffer += matched;
        flushText();
      }
    } else if (which === "data-learning-file") {
      const attId = (matched.match(/data-attachment-id\s*=\s*["']([^"']+)["']/) ?? [])[1];
      const att = attId ? attMap.get(attId) : undefined;
      const fileName = (matched.match(/data-file-name\s*=\s*["']([^"']+)["']/) ?? [])[1] ?? att?.file_name ?? "Datei";
      const mimeType =
        (matched.match(/data-mime-type\s*=\s*["']([^"']+)["']/) ?? [])[1] ?? att?.mime_type ?? "application/octet-stream";
      const sizeBytes =
        Number((matched.match(/data-size-bytes\s*=\s*["']([^"']+)["']/) ?? [])[1] ?? att?.size_bytes ?? 0);
      const storagePath = att?.storage_path ?? "";
      if (attId && storagePath) {
        if (mimeType.startsWith("image/")) {
          blocks.push({
            id: newId(),
            type: "image",
            attachmentId: attId,
            storagePath,
            fileName,
            caption: null,
          });
        } else {
          blocks.push({
            id: newId(),
            type: "file",
            attachmentId: attId,
            storagePath,
            fileName,
            mimeType,
            sizeBytes,
          });
        }
      }
    }
    lastIndex = m.index + matched.length;
  }
  const tail = html.slice(lastIndex);
  if (tail.trim()) textBuffer += tail;
  flushText();

  return blocks;
}
