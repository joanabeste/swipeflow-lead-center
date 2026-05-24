import { requireLearningEditor } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import type { LearningCategory } from "@/lib/types";
import { CategoriesManager } from "./manager";

export default async function LearningCategoriesPage() {
  await requireLearningEditor();
  const db = createServiceClient();
  const { data } = await db.from("learning_categories").select("*").order("sort_order").order("name");
  const categories = (data ?? []) as LearningCategory[];
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Kategorien</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Strukturiere Kurse nach Themenbereichen (z.B. Vertrieb, Fulfillment, Tools).
        </p>
      </header>
      <CategoriesManager initial={categories} />
    </div>
  );
}
