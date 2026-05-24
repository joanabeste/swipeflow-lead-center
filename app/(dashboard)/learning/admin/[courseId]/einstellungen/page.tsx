import { notFound } from "next/navigation";
import { requireLearningEditor } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import type { LearningCategory, LearningCourse } from "@/lib/types";
import { LEARNING_COVER_BUCKET } from "../../../_lib/format";
import { SettingsForm } from "./settings-form";

export default async function CourseSettingsPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  await requireLearningEditor();
  const db = createServiceClient();

  const [courseRes, catsRes, lessonCountRes] = await Promise.all([
    db.from("learning_courses").select("*").eq("id", courseId).maybeSingle(),
    db.from("learning_categories").select("*").order("name"),
    db
      .from("learning_lessons")
      .select("estimated_minutes, learning_modules!inner(course_id)", { count: "exact" })
      .eq("learning_modules.course_id", courseId),
  ]);
  if (!courseRes.data) notFound();

  const course = courseRes.data as LearningCourse;
  const categories = (catsRes.data ?? []) as LearningCategory[];
  type LessonStat = { estimated_minutes: number | null };
  const lessons = (lessonCountRes.data ?? []) as LessonStat[];
  const lessonCount = lessons.length;
  const totalMinutes = lessons.reduce((s, l) => s + (l.estimated_minutes ?? 0), 0);

  const coverPublicBaseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${LEARNING_COVER_BUCKET}`;

  return (
    <SettingsForm
      course={course}
      categories={categories}
      coverPublicBaseUrl={coverPublicBaseUrl}
      lessonCount={lessonCount}
      totalMinutes={totalMinutes}
    />
  );
}
