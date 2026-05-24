import { notFound } from "next/navigation";
import { requireLearningEditor } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import type {
  LearningCourse,
  LearningLesson,
  LearningModule,
  LoadedLearningAttachment,
} from "@/lib/types";
import { getAttachmentsForLessons } from "../../_lib/attachments";
import { CourseEditor } from "./editor";

export default async function CourseAdminPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  await requireLearningEditor();
  const db = createServiceClient();

  const [courseRes, modulesRes, lessonsRes] = await Promise.all([
    db.from("learning_courses").select("*").eq("id", courseId).maybeSingle(),
    db.from("learning_modules").select("*").eq("course_id", courseId).order("sort_order"),
    db
      .from("learning_lessons")
      .select("*, learning_modules!inner(course_id)")
      .eq("learning_modules.course_id", courseId)
      .order("sort_order"),
  ]);
  if (!courseRes.data) notFound();
  const course = courseRes.data as LearningCourse;
  const modules = (modulesRes.data ?? []) as LearningModule[];
  const lessons = (lessonsRes.data ?? []) as LearningLesson[];

  const attachmentMap = await getAttachmentsForLessons(lessons.map((l) => l.id));
  const attachments: Record<string, LoadedLearningAttachment[]> = {};
  for (const [k, v] of attachmentMap.entries()) attachments[k] = v;

  return (
    <CourseEditor
      course={course}
      modules={modules}
      lessons={lessons}
      attachments={attachments}
    />
  );
}
