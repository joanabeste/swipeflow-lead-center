"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { LearningCategory } from "@/lib/types";
import { createCategory, deleteCategory, updateCategory } from "../../_actions/courses";

export function CategoriesManager({ initial }: { initial: LearningCategory[] }) {
  const [cats, setCats] = useState(initial);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();

  const inputCls =
    "block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e] dark:text-gray-100";

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    start(async () => {
      const res = await createCategory({ name });
      if ("error" in res) return alert(res.error);
      setCats([...cats, res.category]);
      setName("");
    });
  }

  async function handleRename(c: LearningCategory) {
    const newName = window.prompt("Neuer Name", c.name);
    if (!newName?.trim() || newName === c.name) return;
    setCats(cats.map((x) => (x.id === c.id ? { ...x, name: newName } : x)));
    const res = await updateCategory({ id: c.id, name: newName });
    if (res.error) alert(res.error);
  }

  async function handleDelete(c: LearningCategory) {
    if (!confirm(`Kategorie "${c.name}" löschen? Kurse darin behalten "Ohne Kategorie".`)) return;
    setCats(cats.filter((x) => x.id !== c.id));
    const res = await deleteCategory(c.id);
    if (res.error) alert(res.error);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Neue Kategorie…"
          className={inputCls}
        />
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-primary-dark disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Anlegen
        </button>
      </form>

      <ul className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
        {cats.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-400">Noch keine Kategorien.</li>}
        {cats.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 dark:border-[#2c2c2e]/50">
            <button onClick={() => handleRename(c)} className="text-left text-sm text-gray-900 hover:text-primary dark:text-gray-100">
              {c.name}
            </button>
            <button onClick={() => handleDelete(c)} className="text-gray-300 hover:text-red-500">
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
