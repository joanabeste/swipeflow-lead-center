import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, Circle, Clock } from "lucide-react";
import { requireSection } from "@/lib/auth";
import { canEditLearning } from "@/lib/types";
import { createServiceClient } from "@/lib/supabase/server";
import type { LearningCourse, LearningLesson, LearningModule } from "@/lib/types";

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ courseSlug: string }>;
}) {
  const { courseSlug } = await params;
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
    db
      .from("learning_lesson_progress")
      .select("lesson_id")
      .eq("user_id", ctx.user.id),
  ]);

  const modules = (modulesRes.data ?? []) as LearningModule[];
  const lessons = (lessonsRes.data ?? []) as LearningLesson[];
  const completed = new Set<string>(
    ((progressRes.data ?? []) as { lesson_id: string }[]).map((r) => r.lesson_id),
  );

  const lessonsByModule = new Map<string, LearningLesson[]>();
  for (const l of lessons) {
    const arr = lessonsByModule.get(l.module_id) ?? [];
    arr.push(l);
    lessonsByModule.set(l.module_id, arr);
  }

  const totalLessons = lessons.length;
  const completedLessons = lessons.filter((l) => completed.has(l.id)).length;
  const pct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
  const totalMinutes = lessons.reduce((s, l) => s + (l.estimated_minutes ?? 0), 0);

  // Erste offene Lektion fuer "Weiter lernen"
  const firstOpen = lessons.find((l) => !completed.has(l.id)) ?? lessons[0] ?? null;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-3">
        <Link href="/learning" className="text-xs text-gray-500 hover:text-primary dark:text-gray-400">
          ← Zurück zur Übersicht
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100">{course.title}</h1>
            {course.summary && (
              <p className="mt-2 max-w-2xl text-sm text-gray-500 dark:text-gray-400">{course.summary}</p>
            )}
          </div>
          {isEditor && (
            <Link
              href={`/learning/admin/${course.id}`}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-[#2c2c2e]/50 dark:text-gray-300 dark:hover:bg-white/5"
            >
              Bearbeiten
            </Link>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
          <span>{totalLessons} Lektionen</span>
          {totalMinutes > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {totalMinutes} Min.
            </span>
          )}
          <span>{pct}% abgeschlossen</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-[#2c2c2e]/50">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        {firstOpen && (
          <div>
            <Link
              href={`/learning/${course.slug}/${firstOpen.id}`}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-primary-dark"
            >
              {completedLessons === 0 ? "Kurs starten" : "Weiter lernen"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </header>

      <div className="space-y-4">
        {modules.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400 dark:border-[#2c2c2e]/50">
            Dieser Kurs enthält noch keine Module.
          </div>
        ) : (
          modules.map((m) => {
            const ml = lessonsByModule.get(m.id) ?? [];
            return (
              <section
                key={m.id}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]"
              >
                <header className="border-b border-gray-100 px-5 py-3 dark:border-[#2c2c2e]/50">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{m.title}</h2>
                </header>
                {ml.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-gray-400">Keine Lektionen.</p>
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-[#2c2c2e]/50">
                    {ml.map((l) => {
                      const done = completed.has(l.id);
                      return (
                        <li key={l.id}>
                          <Link
                            href={`/learning/${course.slug}/${l.id}`}
                            className="flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-gray-50 dark:hover:bg-white/5"
                          >
                            <div className="flex items-center gap-3">
                              {done ? (
                                <CheckCircle2 className="h-5 w-5 text-green-500" />
                              ) : (
                                <Circle className="h-5 w-5 text-gray-300 dark:text-gray-600" />
                              )}
                              <span className="text-sm text-gray-800 dark:text-gray-200">{l.title}</span>
                            </div>
                            {l.estimated_minutes ? (
                              <span className="text-xs text-gray-400">{l.estimated_minutes} Min.</span>
                            ) : null}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
