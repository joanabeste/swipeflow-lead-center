"use server";

import { checkAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { permissionsFromProfile } from "@/lib/types";

export interface LearningSearchHit {
  kind: "course" | "module" | "lesson";
  course_id: string;
  course_slug: string;
  course_title: string;
  lesson_id: string | null;
  module_title: string | null;
  lesson_title: string | null;
  snippet: string | null;
}

/**
 * Sucht Lessons via Postgres-FTS + Kurs-/Modul-Titel via ILIKE.
 * Liefert max. 8 Treffer fuer das Global-Search-Dropdown.
 */
export async function searchLearning(query: string): Promise<LearningSearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const ctx = await checkAuth();
  if (!ctx) return [];
  const perms = permissionsFromProfile(ctx.profile);
  if (!perms.can_learning) return [];

  const supabase = await createClient();

  // Lessons via FTS — RLS filtert published-Constraint via Kurs-Join nicht, also explizit.
  // Wir holen erst die Lesson-Treffer und joinen dann den Kurs.
  const { data: lessonRows } = await supabase
    .from("learning_lessons")
    .select(
      `id, title, module_id,
       learning_modules!inner ( title, course_id,
         learning_courses!inner ( id, slug, title, status )
       )`,
    )
    .textSearch("search_tsv", q, { type: "plain", config: "german" })
    .limit(8);

  const hits: LearningSearchHit[] = [];
  type LessonJoinRow = {
    id: string;
    title: string;
    module_id: string;
    learning_modules: {
      title: string;
      course_id: string;
      learning_courses: { id: string; slug: string; title: string; status: string };
    };
  };
  for (const r of (lessonRows ?? []) as unknown as LessonJoinRow[]) {
    const m = r.learning_modules;
    const c = m?.learning_courses;
    if (!c) continue;
    hits.push({
      kind: "lesson",
      course_id: c.id,
      course_slug: c.slug,
      course_title: c.title,
      lesson_id: r.id,
      module_title: m.title,
      lesson_title: r.title,
      snippet: null,
    });
  }

  // Zusaetzlich Kurs-Titel via ILIKE — nuetzlich wenn der User den Kursnamen tippt.
  if (hits.length < 8) {
    const { data: courseRows } = await supabase
      .from("learning_courses")
      .select("id, slug, title")
      .ilike("title", `%${q}%`)
      .limit(8 - hits.length);
    for (const c of courseRows ?? []) {
      // Doppelte vermeiden
      if (hits.some((h) => h.course_id === c.id && h.kind === "lesson")) continue;
      hits.push({
        kind: "course",
        course_id: c.id as string,
        course_slug: c.slug as string,
        course_title: c.title as string,
        lesson_id: null,
        module_title: null,
        lesson_title: null,
        snippet: null,
      });
    }
  }

  return hits;
}
