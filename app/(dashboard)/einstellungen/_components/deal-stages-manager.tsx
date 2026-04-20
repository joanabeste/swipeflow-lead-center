"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";
import type { DealStage, DealStageKind } from "@/lib/deals/types";
import { saveStageAction, deleteStageAction } from "../../deals/actions";
import { useToastContext } from "../../toast-provider";
import { Card, FormStatus, SubmitButton } from "./ui";

export function DealStagesManager({ stages }: { stages: DealStage[] }) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [editing, setEditing] = useState<DealStage | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletePending, startDelete] = useTransition();

  function handleDelete(id: string, label: string) {
    if (!confirm(`Stage „${label}" löschen?`)) return;
    startDelete(async () => {
      const res = await deleteStageAction(id);
      if ("error" in res) addToast(res.error, "error");
      else {
        addToast("Stage gelöscht.", "success");
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Stages ({stages.length})</h2>
        <button
          onClick={() => { setCreating(true); setEditing(null); }}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-primary-dark"
        >
          <Plus className="h-3.5 w-3.5" />
          Neue Stage
        </button>
      </div>

      <ul className="mt-4 space-y-1.5">
        {stages.map((s) => (
          <li
            key={s.id}
            className="flex items-center gap-2 rounded-md border border-gray-200 p-3 dark:border-[#2c2c2e]"
          >
            <span
              className="inline-block h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium text-sm">{s.label}</p>
                <KindBadge kind={s.kind} />
                {!s.isActive && (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] uppercase text-gray-500 dark:bg-white/5">inaktiv</span>
                )}
              </div>
              <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                ID: {s.id} · Reihenfolge: {s.displayOrder}
              </p>
            </div>
            <button
              onClick={() => { setEditing(s); setCreating(false); }}
              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5"
              title="Bearbeiten"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => handleDelete(s.id, s.label)}
              disabled={deletePending}
              className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-900/20"
              title="Löschen"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>

      {(creating || editing) && (
        <StageEditorModal
          stage={editing}
          maxOrder={stages.reduce((m, s) => Math.max(m, s.displayOrder), 0)}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      )}
    </Card>
  );
}

function KindBadge({ kind }: { kind: DealStageKind }) {
  const cfg: Record<DealStageKind, { label: string; cls: string }> = {
    open: { label: "offen", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
    won: { label: "gewonnen", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
    lost: { label: "verloren", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  };
  const c = cfg[kind];
  return <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${c.cls}`}>{c.label}</span>;
}

function StageEditorModal({
  stage,
  maxOrder,
  onClose,
}: {
  stage: DealStage | null;
  maxOrder: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [state, formAction, pending] = useActionState(saveStageAction, undefined);

  if (state?.success) {
    addToast("Stage gespeichert.", "success");
    onClose();
    router.refresh();
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-[#1c1c1e]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-[#2c2c2e]">
          <h2 className="text-lg font-semibold">
            {stage ? `Stage bearbeiten: ${stage.label}` : "Neue Stage"}
          </h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form action={formAction} className="space-y-4 p-6">
          {stage && <input type="hidden" name="id" value={stage.id} />}
          <FormStatus state={state} />

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label htmlFor="s-label" className="block text-sm font-medium">Label</label>
              <input
                id="s-label"
                name="label"
                type="text"
                required
                defaultValue={stage?.label ?? ""}
                className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325]"
              />
            </div>
            <div>
              <label htmlFor="s-color" className="block text-sm font-medium">Farbe</label>
              <input
                id="s-color"
                name="color"
                type="color"
                defaultValue={stage?.color ?? "#6b7280"}
                className="mt-1.5 block h-10 w-full rounded-lg border border-gray-300 bg-white dark:border-[#2c2c2e] dark:bg-[#232325]"
              />
            </div>
            <div>
              <label htmlFor="s-order" className="block text-sm font-medium">Reihenfolge</label>
              <input
                id="s-order"
                name="display_order"
                type="number"
                required
                defaultValue={stage?.displayOrder ?? maxOrder + 10}
                className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325]"
              />
            </div>
            <div>
              <label htmlFor="s-kind" className="block text-sm font-medium">Typ</label>
              <select
                id="s-kind"
                name="kind"
                required
                defaultValue={stage?.kind ?? "open"}
                className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325]"
              >
                <option value="open">offen</option>
                <option value="won">gewonnen</option>
                <option value="lost">verloren</option>
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="is_active"
                  defaultChecked={stage?.isActive ?? true}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                Aktiv
              </label>
            </div>
            <div className="col-span-2">
              <label htmlFor="s-desc" className="block text-sm font-medium">Beschreibung (optional)</label>
              <textarea
                id="s-desc"
                name="description"
                rows={2}
                defaultValue={stage?.description ?? ""}
                className="mt-1.5 block w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325]"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
            >
              Abbrechen
            </button>
            <SubmitButton pending={pending}>
              <Check className="h-3.5 w-3.5" />
              Speichern
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
