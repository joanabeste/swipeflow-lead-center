"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Check, Plus, Pencil, X } from "lucide-react";
import type { CustomLeadStatus } from "@/lib/types";
import { saveCrmStatus, deleteCrmStatus } from "./actions";

export function CrmStatusManager({ statuses }: { statuses: CustomLeadStatus[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<CustomLeadStatus | null>(null);
  const [adding, setAdding] = useState(false);

  function refresh() {
    router.refresh();
    setEditing(null);
    setAdding(false);
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">CRM-Status verwalten</h3>
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-white hover:bg-primary-dark"
        >
          <Plus className="h-4 w-4" />
          Neuer Status
        </button>
      </div>

      {adding && (
        <StatusForm onDone={refresh} onCancel={() => setAdding(false)} nextOrder={(statuses.at(-1)?.display_order ?? 0) + 10} />
      )}

      <ul className="mt-4 space-y-2">
        {statuses.length === 0 && !adding && (
          <li className="rounded-md border border-dashed border-gray-200 p-4 text-center text-sm text-gray-400 dark:border-[#2c2c2e]">
            Noch keine Stati — lege den ersten an.
          </li>
        )}
        {statuses.map((s) => (
          <li key={s.id}>
            {editing?.id === s.id ? (
              <StatusForm status={s} onDone={refresh} onCancel={() => setEditing(null)} nextOrder={s.display_order} />
            ) : (
              <StatusRow status={s} onEdit={() => setEditing(s)} onDeleted={refresh} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusRow({
  status, onEdit, onDeleted,
}: { status: CustomLeadStatus; onEdit: () => void; onDeleted: () => void }) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`Status "${status.label}" löschen? Leads mit diesem Status behalten den Wert.`)) return;
    startTransition(async () => {
      await deleteCrmStatus(status.id);
      onDeleted();
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-gray-100 p-3 dark:border-[#2c2c2e]">
      <div className="flex items-center gap-3">
        <span
          className="inline-block h-4 w-4 rounded-full border border-gray-200 dark:border-gray-700"
          style={{ backgroundColor: status.color }}
        />
        <div>
          <p className="text-sm font-medium">{status.label}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            ID: {status.id} · Reihenfolge: {status.display_order}
            {!status.is_active && " · Inaktiv"}
          </p>
          {status.description && (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{status.description}</p>
          )}
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

function StatusForm({
  status, onDone, onCancel, nextOrder,
}: {
  status?: CustomLeadStatus;
  onDone: () => void;
  onCancel: () => void;
  nextOrder: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await saveCrmStatus(undefined, formData);
      if (res && "error" in res && res.error) setError(res.error);
      else onDone();
    });
  }

  return (
    <form
      action={submit}
      className="rounded-md border border-primary/40 bg-primary/5 p-3 dark:bg-primary/10"
    >
      {status && <input type="hidden" name="id" value={status.id} />}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          <span className="text-xs text-gray-500 dark:text-gray-400">Label</span>
          <input
            name="label"
            defaultValue={status?.label ?? ""}
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
            defaultValue={status?.color ?? "#6b7280"}
            className="mt-1 block h-9 w-full cursor-pointer rounded-md border border-gray-200 bg-white dark:border-[#2c2c2e] dark:bg-[#161618]"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs text-gray-500 dark:text-gray-400">Reihenfolge</span>
          <input
            type="number"
            name="display_order"
            defaultValue={status?.display_order ?? nextOrder}
            className="mt-1 w-full rounded-md border border-gray-200 bg-white p-2 dark:border-[#2c2c2e] dark:bg-[#161618]"
          />
        </label>
        <label className="inline-flex items-center gap-2 self-end text-sm">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={status?.is_active ?? true}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          Aktiv
        </label>
        <label className="text-sm md:col-span-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Beschreibung (optional)</span>
          <input
            name="description"
            defaultValue={status?.description ?? ""}
            className="mt-1 w-full rounded-md border border-gray-200 bg-white p-2 dark:border-[#2c2c2e] dark:bg-[#161618]"
          />
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
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-white hover:bg-primary-dark disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
          {pending ? "Speichern…" : "Speichern"}
        </button>
      </div>
    </form>
  );
}
