"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, Pencil, X } from "lucide-react";
import { updateProject } from "../../actions";
import { useToastContext } from "../../../toast-provider";

export function ProjectNameCell({
  projectId,
  initial,
}: {
  projectId: string;
  initial: string;
}) {
  const { addToast } = useToastContext();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();

  function save() {
    const next = value.trim();
    if (!next) {
      addToast("Name darf nicht leer sein.", "error");
      return;
    }
    if (next === initial) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      const res = await updateProject(projectId, { name: next });
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      addToast("Projektname gespeichert.", "success");
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={value}
          disabled={pending}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setValue(initial);
              setEditing(false);
            }
          }}
          className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e] dark:text-gray-100"
        />
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded p-1 text-green-600 hover:bg-green-50 disabled:opacity-50 dark:hover:bg-green-900/20"
          aria-label="Speichern"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            setValue(initial);
            setEditing(false);
          }}
          disabled={pending}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-white/5"
          aria-label="Abbrechen"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-1.5">
      <Link
        href={`/fulfillment/projekte/${projectId}`}
        className="font-medium text-gray-900 hover:text-primary dark:text-white"
      >
        {initial}
      </Link>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded p-0.5 text-gray-400 opacity-50 transition group-hover:opacity-100 hover:text-primary dark:text-gray-500"
        aria-label="Umbenennen"
        title="Umbenennen"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}
