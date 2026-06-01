"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Check, Plus, Pencil, X } from "lucide-react";
import type { ProjectType } from "@/lib/fulfillment/types";
import { FEATURE_CATALOG } from "@/lib/fulfillment/project-features";
import { saveProjectType, deleteProjectType } from "./actions";

const FEATURE_LABEL = new Map(FEATURE_CATALOG.map((f) => [f.key, f.label]));

export function ProjectTypeManager({ types }: { types: ProjectType[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ProjectType | null>(null);
  const [adding, setAdding] = useState(false);

  function refresh() {
    router.refresh();
    setEditing(null);
    setAdding(false);
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Projekt-Typen verwalten</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Label, Farbe und Feature-Set je Typ. Die Reihenfolge bestimmt die Anzeige in der Typ-Auswahl.
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-gray-900 hover:bg-primary-dark"
        >
          <Plus className="h-4 w-4" />
          Neuer Typ
        </button>
      </div>

      {adding && (
        <TypeForm onDone={refresh} onCancel={() => setAdding(false)} nextOrder={(types.at(-1)?.display_order ?? 0) + 10} />
      )}

      <ul className="mt-4 space-y-2">
        {types.length === 0 && !adding && (
          <li className="rounded-md border border-dashed border-gray-200 p-4 text-center text-sm text-gray-400 dark:border-[#2c2c2e]">
            Noch keine Typen — lege den ersten an.
          </li>
        )}
        {types.map((t) => (
          <li key={t.id}>
            {editing?.id === t.id ? (
              <TypeForm type={t} onDone={refresh} onCancel={() => setEditing(null)} nextOrder={t.display_order} />
            ) : (
              <TypeRow type={t} onEdit={() => setEditing(t)} onDeleted={refresh} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TypeRow({ type, onEdit, onDeleted }: { type: ProjectType; onEdit: () => void; onDeleted: () => void }) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`Typ "${type.label}" löschen? Projekte mit diesem Typ behalten ihre Daten, verlieren aber die Feature-Tabs.`)) return;
    startTransition(async () => {
      await deleteProjectType(type.id);
      onDeleted();
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-gray-100 p-3 dark:border-[#2c2c2e]">
      <div className="flex items-center gap-3">
        <span
          className="inline-block h-4 w-4 rounded-full border border-gray-200 dark:border-gray-700"
          style={{ backgroundColor: type.color }}
        />
        <div>
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
            {type.label}
            {!type.is_active && (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-white/5 dark:text-gray-400">
                Inaktiv
              </span>
            )}
            {type.features.map((f) => (
              <span
                key={f}
                className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
              >
                {FEATURE_LABEL.get(f) ?? f}
              </span>
            ))}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Slug: {type.slug} · Reihenfolge: {type.display_order}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={onEdit} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleDelete}
          disabled={pending}
          className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function TypeForm({
  type, onDone, onCancel, nextOrder,
}: {
  type?: ProjectType;
  onDone: () => void;
  onCancel: () => void;
  nextOrder: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await saveProjectType(undefined, formData);
      if (res && "error" in res && res.error) setError(res.error);
      else onDone();
    });
  }

  return (
    <form action={submit} className="rounded-md border border-primary/40 bg-primary/5 p-3 dark:bg-primary/10">
      {type && <input type="hidden" name="id" value={type.id} />}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          <span className="text-xs text-gray-500 dark:text-gray-400">Label</span>
          <input
            name="label"
            defaultValue={type?.label ?? ""}
            required
            autoFocus
            className="mt-1 w-full rounded-md border border-gray-200 bg-white p-2 dark:border-[#2c2c2e] dark:bg-[#161618]"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs text-gray-500 dark:text-gray-400">Farbe</span>
          <input
            type="color"
            name="color"
            defaultValue={type?.color ?? "#6b7280"}
            className="mt-1 block h-9 w-full cursor-pointer rounded-md border border-gray-200 bg-white dark:border-[#2c2c2e] dark:bg-[#161618]"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs text-gray-500 dark:text-gray-400">Icon (lucide-Name, optional)</span>
          <input
            name="icon"
            defaultValue={type?.icon ?? ""}
            placeholder="z. B. Globe, Megaphone, Briefcase"
            className="mt-1 w-full rounded-md border border-gray-200 bg-white p-2 dark:border-[#2c2c2e] dark:bg-[#161618]"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs text-gray-500 dark:text-gray-400">Reihenfolge</span>
          <input
            type="number"
            name="display_order"
            defaultValue={type?.display_order ?? nextOrder}
            className="mt-1 w-full rounded-md border border-gray-200 bg-white p-2 dark:border-[#2c2c2e] dark:bg-[#161618]"
          />
        </label>
        <fieldset className="text-sm md:col-span-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Features</span>
          <div className="mt-1.5 flex flex-wrap gap-3">
            {FEATURE_CATALOG.map((f) => (
              <label key={f.key} className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  name="features"
                  value={f.key}
                  defaultChecked={type?.features?.includes(f.key) ?? false}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                {f.label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="inline-flex items-center gap-2 self-end text-sm">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={type?.is_active ?? true}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          Aktiv
        </label>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-[#2c2c2e] dark:hover:bg-white/5"
        >
          <X className="h-3.5 w-3.5" />
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-gray-900 hover:bg-primary-dark disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
          {pending ? "Speichern…" : "Speichern"}
        </button>
      </div>
    </form>
  );
}
