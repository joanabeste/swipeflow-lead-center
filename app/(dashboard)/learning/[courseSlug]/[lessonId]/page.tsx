import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Paperclip } from "lucide-react";
import { requireSection } from "@/lib/auth";
import { canEditLearning } from "@/lib/types";
import { createServiceClient } from "@/lib/supabase/server";
import type { LearningCourse, LearningLesson, LearningModule } from "@/lib/types";
import { VideoEmbed } from "../../_components/video-embed";
import { LessonRenderer } from "../../_components/lesson-renderer";
import { BlockRenderer } from "../../_components/block-renderer";
import { CompleteLessonButton } from "../../_components/complete-lesson-button";
import { CourseTree } from "../../_components/course-tree";
import { getAttachmentsForLessons } from "../../_lib/attachments";
import { formatBytes, isImageMime } from "../../_lib/format";

export default async function LessonViewerPage({
  params,
}: {
  params: Promise<{ courseSlug: string; lessonId: string }>;
}) {
  const { courseSlug, lessonId } = await params;
  const ctx = await requireSection("can_learning");
  const isEditor = canEditLearning(ctx.profile);
  const db = createServiceClient();

  const { data: courseRow } = await db
    .from("learning_courses")
    .select("*")
    .eq("slug", courseSlug)
    .maybeSingle();
  if (!courseRow) notFound();
  const course = courseRow as LearningCourse;
  if (course.status !== "published" && !isEditor) notFound();

  const [modulesRes, lessonsRes, progressRes] = await Promise.all([
    db.from("learning_modules").select("*").eq("course_id", course.id).order("sort_order"),
    db
      .from("learning_lessons")
      .select("*, learning_modules!inner(course_id)")
      .eq("learning_modules.course_id", course.id)
      .order("sort_order"),
    db.from("learning_lesson_progress").select("lesson_id").eq("user_id", ctx.user.id),
  ]);

  const modules = (modulesRes.data ?? []) as LearningModule[];
  const lessons = (lessonsRes.data ?? []) as LearningLesson[];

  // Lessons in Modul-Reihenfolge sortieren — flach, fuer Prev/Next.
  const moduleOrder = new Map(modules.map((m, idx) => [m.id, idx]));
  const flat = [...lessons].sort((a, b) => {
    const ma = moduleOrder.get(a.module_id) ?? 999;
    const mb = moduleOrder.get(b.module_id) ?? 999;
    if (ma !== mb) return ma - mb;
    return a.sort_order - b.sort_order;
  });
  const idx = flat.findIndex((l) => l.id === lessonId);
  if (idx === -1) notFound();
  const lesson = flat[idx];
  const prev = idx > 0 ? flat[idx - 1] : null;
  const next = idx < flat.length - 1 ? flat[idx + 1] : null;

  const completed = new Set<string>(
    ((progressRes.data ?? []) as { lesson_id: string }[]).map((r) => r.lesson_id),
  );

  const attachmentMap = await getAttachmentsForLessons([lesson.id]);
  const attachments = attachmentMap.get(lesson.id) ?? [];

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
      {/* Sidebar mit Kurs-Baum */}
      <aside className="lg:sticky lg:top-0 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
        <CourseTree
          courseSlug={course.slug}
          courseTitle={course.title}
          modules={modules}
          lessons={lessons}
          currentLessonId={lesson.id}
          completedIds={completed}
        />
      </aside>

      <article className="space-y-6">
        <header className="space-y-1">
          <Link href={`/learning/${course.slug}`} className="text-xs text-gray-500 hover:text-primary dark:text-gray-400">
            ← {course.title}
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{lesson.title}</h1>
        </header>

        {/* V4: wenn Blocks vorhanden → Block-Renderer */}
        {lesson.blocks && lesson.blocks.length > 0 ? (
          (() => {
            const signedUrls = new Map(attachments.map((a) => [a.id, a.signed_url]));
            return <BlockRenderer blocks={lesson.blocks} signedUrls={signedUrls} />;
          })()
        ) : (
          <>
            {/* Legacy: alte Lessons mit separatem video_url-Feld (Pre-V3). */}
            {lesson.video_url && !lesson.content_html?.includes("data-loom-id") && !lesson.content_html?.includes("data-youtube-video") && (
              <VideoEmbed url={lesson.video_url} />
            )}
            {lesson.content_html && <LessonRenderer html={lesson.content_html} attachments={attachments} />}
          </>
        )}

        {/* Legacy-Materialien-Liste: nur fuer Pre-V4-Lessons ohne Blocks. */}
        {(!lesson.blocks || lesson.blocks.length === 0) && attachments.length > 0 && !(lesson.content_html ?? "").includes("data-learning-file") && (
          <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
              <Paperclip className="h-4 w-4" /> Materialien
            </h2>
            <ul className="space-y-2">
              {attachments.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 dark:bg-[#222224]">
                  <div className="flex items-center gap-3">
                    {isImageMime(a.mime_type) && a.signed_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.signed_url} alt="" className="h-10 w-10 rounded object-cover" />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded bg-primary/10 text-xs font-semibold uppercase text-primary">
                        {a.file_name.split(".").pop()?.slice(0, 4) || "FILE"}
                      </span>
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{a.file_name}</p>
                      <p className="text-xs text-gray-400">{formatBytes(a.size_bytes)}</p>
                    </div>
                  </div>
                  {a.signed_url && (
                    <a
                      href={a.signed_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Öffnen
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-gray-200 pt-5 dark:border-[#2c2c2e]/50">
          {prev ? (
            <Link
              href={`/learning/${course.slug}/${prev.id}`}
              className="inline-flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-[#2c2c2e]/50 dark:text-gray-300 dark:hover:bg-white/5"
            >
              <ChevronLeft className="h-4 w-4" /> {prev.title}
            </Link>
          ) : (
            <span />
          )}
          <CompleteLessonButton lessonId={lesson.id} completed={completed.has(lesson.id)} nextHref={next ? `/learning/${course.slug}/${next.id}` : null} />
          {next ? (
            <Link
              href={`/learning/${course.slug}/${next.id}`}
              className="inline-flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-[#2c2c2e]/50 dark:text-gray-300 dark:hover:bg-white/5"
            >
              {next.title} <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <span />
          )}
        </div>
      </article>
    </div>
  );
}
