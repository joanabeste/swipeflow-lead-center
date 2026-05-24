"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LearningCategory } from "@/lib/types";
import { createCourse } from "../../_actions/courses";

export function NewCourseForm({ categories }: { categories: LearningCategory[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createCourse({
        title,
        summary: summary || undefined,
        category_id: categoryId || null,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      router.push(`/learning/admin/${res.course.id}`);
    });
  }

  const labelCls = "block text-sm font-medium text-gray-700 dark:text-gray-300";
  const inputCls =
    "mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e] dark:text-gray-100";

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
      <div>
        <label className={labelCls}>Titel</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputCls}
          placeholder="z.B. Vertrieb Onboarding"
          required
        />
      </div>
      <div>
        <label className={labelCls}>Kurzbeschreibung</label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          className={inputCls + " min-h-[80px]"}
          placeholder="Worum geht's in diesem Kurs?"
        />
      </div>
      <div>
        <label className={labelCls}>Kategorie</label>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
          <option value="">— Keine —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending || !title.trim()}
        className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition hover:bg-primary-dark disabled:opacity-50"
      >
        {pending ? "Wird angelegt…" : "Kurs anlegen"}
      </button>
    </form>
  );
}
