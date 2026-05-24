import Link from "next/link";
import { Plus } from "lucide-react";
import { requireLearningEditor } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import type { LearningCourse, LearningCategory } from "@/lib/types";

export default async function LearningAdminPage() {
  await requireLearningEditor();
  const db = createServiceClient();

  const [coursesRes, catsRes] = await Promise.all([
    db.from("learning_courses").select("*").order("updated_at", { ascending: false }),
    db.from("learning_categories").select("*"),
  ]);
  const courses = (coursesRes.data ?? []) as LearningCourse[];
  const cats = new Map(((catsRes.data ?? []) as LearningCategory[]).map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Kurse verwalten</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Erstelle, bearbeite und veröffentliche Schulungs-Kurse.
          </p>
        </div>
        <Link
          href="/learning/admin/neu"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-primary-dark"
        >
          <Plus className="h-4 w-4" /> Neuer Kurs
        </Link>
      </header>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
        {courses.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400">Noch keine Kurse — leg den ersten an.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 dark:bg-[#222224] dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 text-left">Titel</th>
                <th className="px-4 py-3 text-left">Kategorie</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Geändert</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-[#2c2c2e]/50">
              {courses.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{c.title}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                    {c.category_id ? cats.get(c.category_id)?.name ?? "—" : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {c.status === "published" ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        Veröffentlicht
                      </span>
                    ) : (
                      <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                        Entwurf
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(c.updated_at).toLocaleDateString("de-DE")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/learning/admin/${c.id}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Bearbeiten →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
