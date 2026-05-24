"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

export function LearningObjectivesEditor({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const t = draft.trim();
    if (!t) return;
    onChange([...value, t]);
    setDraft("");
  }

  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  function update(i: number, v: string) {
    onChange(value.map((x, idx) => (idx === i ? v : x)));
  }

  return (
    <div className="space-y-2">
      {value.length === 0 ? (
        <p className="text-xs text-gray-400">Noch keine Lernziele.</p>
      ) : (
        <ul className="space-y-1.5">
          {value.map((v, i) => (
            <li key={i} className="group flex items-center gap-2 rounded-lg bg-gray-50 px-2 py-1 dark:bg-[#222224]">
              <span className="text-xs text-gray-400">•</span>
              <input
                value={v}
                onChange={(e) => update(i, e.target.value)}
                onBlur={() => {
                  if (!v.trim()) remove(i);
                  else onChange([...value]);
                }}
                className="flex-1 border-0 bg-transparent text-xs focus:outline-none"
              />
              <button
                onClick={() => remove(i)}
                className="text-gray-300 opacity-0 transition group-hover:opacity-100 hover:text-red-500"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="flex gap-1"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Lernziel hinzufügen…"
          className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="rounded-lg bg-primary px-2 py-1.5 text-xs text-gray-900 disabled:opacity-50"
        >
          <Plus className="h-3 w-3" />
        </button>
      </form>
    </div>
  );
}
