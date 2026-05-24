import { requireSection } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import type { LearningCategory, LearningCourse } from "@/lib/types";
import { LEARNING_COVER_BUCKET } from "./_lib/format";
import { CourseCard } from "./_components/course-card";
import { canEditLearning } from "@/lib/types";
import Link from "next/link";
import { Plus, BookOpen } from "lucide-react";

export default async function LearningOverviewPage() {
  const ctx = await requireSection("can_learning");
  const isEditor = canEditLearning(ctx.profile);
  const db = createServiceClient();

  const [categoriesRes, coursesRes, lessonsRes, progressRes] = await Promise.all([
    db.from("learning_categories").select("*").order("sort_order").order("name"),
    db
      .from("learning_courses")
      .select("*")
      .order("sort_order")
      .order("created_at", { ascending: false }),
    db.from("learning_lessons").select("id, module_id, learning_modules!inner(course_id)"),
    db.from("learning_lesson_progress").select("lesson_id").eq("user_id", ctx.user.id),
  ]);

  const categories = (categoriesRes.data ?? []) as LearningCategory[];
  let courses = (coursesRes.data ?? []) as LearningCourse[];
  if (!isEditor) courses = courses.filter((c) => c.status === "published");

  // Lesson-Counts pro Kurs
  type LessonJoin = { id: string; module_id: string; learning_modules: { course_id: string } };
  const lessons = (lessonsRes.data ?? []) as unknown as LessonJoin[];
  const lessonsByCourse = new Map<string, string[]>();
  for (const l of lessons) {
    const cid = l.learning_modules?.course_id;
    if (!cid) continue;
    const arr = lessonsByCourse.get(cid) ?? [];
    arr.push(l.id);
    lessonsByCourse.set(cid, arr);
  }

  const completed = new Set<string>(((progressRes.data ?? []) as { lesson_id: string }[]).map((r) => r.lesson_id));

  function coverUrl(path: string | null): string | null {
    if (!path) return null;
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${LEARNING_COVER_BUCKET}/${path}`;
  }

  // Kurse pro Kategorie gruppieren, plus "Sonstiges" fuer ohne Kategorie
  const grouped = new Map<string, LearningCourse[]>();
  for (const c of courses) {
    const key = c.category_id ?? "__none__";
    const arr = grouped.get(key) ?? [];
    arr.push(c);
    grouped.set(key, arr);
  }
  const sortedCategories = [...categories, { id: "__none__", name: "Ohne Kategorie", slug: "ohne", description: null, icon: null, sort_order: 999, created_at: "", updated_at: "" } as LearningCategory];

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Learning</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Schulungen, Anleitungen und interne Onboarding-Kurse.
          </p>
        </div>
        {isEditor && (
          <Link
            href="/learning/admin/neu"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-primary-dark"
          >
            <Plus className="h-4 w-4" />
            Neuer Kurs
          </Link>
        )}
      </header>

      {courses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
          <BookOpen className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
          <h2 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">Noch keine Kurse</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {isEditor ? "Lege deinen ersten Kurs an." : "Sobald Inhalte veröffentlicht sind, erscheinen sie hier."}
          </p>
        </div>
      ) : (
        sortedCategories.map((cat) => {
          const list = grouped.get(cat.id) ?? [];
          if (list.length === 0) return null;
          return (
            <section key={cat.id} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {cat.name}
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((c) => {
                  const lessonIds = lessonsByCourse.get(c.id) ?? [];
                  const completedCount = lessonIds.filter((id) => completed.has(id)).length;
                  return (
                    <CourseCard
                      key={c.id}
                      href={`/learning/${c.slug}`}
                      title={c.title}
                      summary={c.summary}
                      coverUrl={coverUrl(c.cover_image_path)}
                      lessonCount={lessonIds.length}
                      completedCount={completedCount}
                      status={c.status}
                    />
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
