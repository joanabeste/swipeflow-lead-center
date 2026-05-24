import { requireLearningEditor } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import type { LearningCategory } from "@/lib/types";
import { NewCourseForm } from "./form";

export default async function NewCoursePage() {
  await requireLearningEditor();
  const db = createServiceClient();
  const { data } = await db.from("learning_categories").select("*").order("name");
  const categories = (data ?? []) as LearningCategory[];
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Neuer Kurs</h1>
      <NewCourseForm categories={categories} />
    </div>
  );
}
