import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import type { LearningLesson, LearningModule } from "@/lib/types";

export function CourseTree({
  courseSlug,
  courseTitle,
  modules,
  lessons,
  currentLessonId,
  completedIds,
}: {
  courseSlug: string;
  courseTitle: string;
  modules: LearningModule[];
  lessons: LearningLesson[];
  currentLessonId: string;
  completedIds: Set<string>;
}) {
  const byModule = new Map<string, LearningLesson[]>();
  for (const l of lessons) {
    const arr = byModule.get(l.module_id) ?? [];
    arr.push(l);
    byModule.set(l.module_id, arr);
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3 text-sm dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
      <Link href={`/learning/${courseSlug}`} className="mb-3 block px-2 text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-primary dark:text-gray-400">
        {courseTitle}
      </Link>
      <div className="space-y-3">
        {modules.map((m) => {
          const ml = byModule.get(m.id) ?? [];
          return (
            <div key={m.id}>
              <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {m.title}
              </p>
              <ul className="mt-1 space-y-0.5">
                {ml.map((l) => {
                  const isCurrent = l.id === currentLessonId;
                  const done = completedIds.has(l.id);
                  return (
                    <li key={l.id}>
                      <Link
                        href={`/learning/${courseSlug}/${l.id}`}
                        className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition ${
                          isCurrent
                            ? "bg-primary/10 text-primary"
                            : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
                        }`}
                      >
                        {done ? (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
                        ) : (
                          <Circle className="h-3.5 w-3.5 shrink-0 text-gray-300 dark:text-gray-600" />
                        )}
                        <span className="line-clamp-1 text-xs">{l.title}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
