import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { requireSection } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import type { LearningCourse } from "@/lib/types";

export default async function MyProgressPage() {
  const ctx = await requireSection("can_learning");
  const db = createServiceClient();

  const [coursesRes, lessonsRes, progressRes] = await Promise.all([
    db.from("learning_courses").select("*").eq("status", "published"),
    db.from("learning_lessons").select("id, module_id, learning_modules!inner(course_id)"),
    db.from("learning_lesson_progress").select("lesson_id, completed_at").eq("user_id", ctx.user.id),
  ]);
  const courses = (coursesRes.data ?? []) as LearningCourse[];
  type LessonJoin = { id: string; module_id: string; learning_modules: { course_id: string } };
  const lessons = (lessonsRes.data ?? []) as unknown as LessonJoin[];
  const completed = new Set<string>(((progressRes.data ?? []) as { lesson_id: string }[]).map((r) => r.lesson_id));

  const byCourse = new Map<string, { total: number; done: number }>();
  for (const l of lessons) {
    const cid = l.learning_modules?.course_id;
    if (!cid) continue;
    const entry = byCourse.get(cid) ?? { total: 0, done: 0 };
    entry.total++;
    if (completed.has(l.id)) entry.done++;
    byCourse.set(cid, entry);
  }

  const rows = courses
    .map((c) => ({ course: c, stats: byCourse.get(c.id) ?? { total: 0, done: 0 } }))
    .sort((a, b) => {
      const ra = a.stats.total ? a.stats.done / a.stats.total : 0;
      const rb = b.stats.total ? b.stats.done / b.stats.total : 0;
      return rb - ra;
    });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Mein Fortschritt</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Übersicht über deine angefangenen und abgeschlossenen Kurse.
        </p>
      </header>

      <ul className="space-y-2">
        {rows.length === 0 && (
          <li className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400 dark:border-[#2c2c2e]/50">
            Es gibt noch keine veröffentlichten Kurse.
          </li>
        )}
        {rows.map(({ course, stats }) => {
          const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
          return (
            <li key={course.id}>
              <Link
                href={`/learning/${course.slug}`}
                className="block rounded-2xl border border-gray-200 bg-white p-4 transition hover:shadow-md dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{course.title}</h2>
                    <p className="text-xs text-gray-400">
                      {stats.done} von {stats.total} Lektionen
                    </p>
                  </div>
                  <span className="flex items-center gap-1 text-sm font-medium text-gray-600 dark:text-gray-300">
                    {pct === 100 && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                    {pct}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-[#2c2c2e]/50">
                  <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
