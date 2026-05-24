import { notFound } from "next/navigation";
import { requireLearningEditor } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import type { LearningCourse, LearningCategory, LearningLesson, LearningModule, LoadedLearningAttachment } from "@/lib/types";
import { getAttachmentsForLessons } from "../../_lib/attachments";
import { LEARNING_COVER_BUCKET } from "../../_lib/format";
import { CourseEditor } from "./editor";

export default async function CourseAdminPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  await requireLearningEditor();
  const db = createServiceClient();

  const [courseRes, catsRes, modulesRes, lessonsRes] = await Promise.all([
    db.from("learning_courses").select("*").eq("id", courseId).maybeSingle(),
    db.from("learning_categories").select("*").order("name"),
    db.from("learning_modules").select("*").eq("course_id", courseId).order("sort_order"),
    db
      .from("learning_lessons")
      .select("*, learning_modules!inner(course_id)")
      .eq("learning_modules.course_id", courseId)
      .order("sort_order"),
  ]);
  if (!courseRes.data) notFound();
  const course = courseRes.data as LearningCourse;
  const categories = (catsRes.data ?? []) as LearningCategory[];
  const modules = (modulesRes.data ?? []) as LearningModule[];
  const lessons = (lessonsRes.data ?? []) as LearningLesson[];

  const attachmentMap = await getAttachmentsForLessons(lessons.map((l) => l.id));
  const attachments: Record<string, LoadedLearningAttachment[]> = {};
  for (const [k, v] of attachmentMap.entries()) attachments[k] = v;

  const coverPublicBaseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${LEARNING_COVER_BUCKET}`;

  return (
    <CourseEditor
      course={course}
      categories={categories}
      modules={modules}
      lessons={lessons}
      attachments={attachments}
      coverPublicBaseUrl={coverPublicBaseUrl}
    />
  );
}
