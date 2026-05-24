"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2 } from "lucide-react";
import { markLessonComplete, markLessonIncomplete } from "../_actions/progress";

export function CompleteLessonButton({
  lessonId,
  completed,
  nextHref,
}: {
  lessonId: string;
  completed: boolean;
  nextHref: string | null;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function handleClick() {
    start(async () => {
      const res = completed ? await markLessonIncomplete(lessonId) : await markLessonComplete(lessonId);
      if (res.error) {
        alert(res.error);
        return;
      }
      if (!completed && nextHref) router.push(nextHref);
      else router.refresh();
    });
  }

  if (completed) {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 transition hover:bg-green-100 disabled:opacity-50 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-300"
      >
        <CheckCircle2 className="h-4 w-4" /> Abgeschlossen
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-primary-dark disabled:opacity-50"
    >
      <Check className="h-4 w-4" /> Lektion abschließen
    </button>
  );
}
