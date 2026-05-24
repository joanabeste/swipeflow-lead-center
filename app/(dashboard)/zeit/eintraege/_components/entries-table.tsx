"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2, Check, X } from "lucide-react";
import type { TimeEntry } from "@/lib/zeit/types";
import { deleteEntry, updateEntry } from "../../actions";
import { useToastContext } from "../../../toast-provider";
import { formatDateDe, formatTimeDe, formatHours, toDatetimeLocalValue } from "@/lib/zeit/format";

export function EntriesTable({ entries }: { entries: TimeEntry[] }) {
  const { addToast } = useToastContext();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400 dark:border-[#2c2c2e]/60">
        Noch keine Eintraege.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 dark:bg-[#1c1c1e]">
          <tr>
            <th className="px-4 py-3 text-left">Datum</th>
            <th className="px-4 py-3 text-left">Start</th>
            <th className="px-4 py-3 text-left">Ende</th>
            <th className="px-4 py-3 text-left">Dauer</th>
            <th className="px-4 py-3 text-left">Notiz</th>
            <th className="px-4 py-3 text-right">Aktion</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-[#2c2c2e]/40">
          {entries.map((e) =>
            editingId === e.id ? (
              <EditRow
                key={e.id}
                entry={e}
                pending={pending}
                onCancel={() => setEditingId(null)}
                onSave={(input) =>
                  startTransition(async () => {
                    const res = await updateEntry(e.id, input);
                    if ("error" in res) addToast(res.error, "error");
                    else {
                      addToast("Eintrag aktualisiert.", "success");
                      setEditingId(null);
                    }
                  })
                }
              />
            ) : (
              <DisplayRow
                key={e.id}
                entry={e}
                onEdit={() => setEditingId(e.id)}
                onDelete={() =>
                  startTransition(async () => {
                    if (!confirm("Eintrag wirklich loeschen?")) return;
                    const res = await deleteEntry(e.id);
                    if ("error" in res) addToast(res.error, "error");
                    else addToast("Eintrag geloescht.", "success");
                  })
                }
              />
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function DisplayRow({ entry, onEdit, onDelete }: { entry: TimeEntry; onEdit: () => void; onDelete: () => void }) {
  const start = new Date(entry.started_at);
  const end = entry.ended_at ? new Date(entry.ended_at) : null;
  const seconds = end ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000)) : 0;
  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{formatDateDe(start)}</td>
      <td className="px-4 py-3 font-mono text-gray-700 dark:text-gray-200">{formatTimeDe(start)}</td>
      <td className="px-4 py-3 font-mono text-gray-700 dark:text-gray-200">
        {end ? formatTimeDe(end) : <span className="text-amber-600">laeuft</span>}
      </td>
      <td className="px-4 py-3 font-mono text-gray-900 dark:text-white">{end ? `${formatHours(seconds)} h` : "—"}</td>
      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{entry.note ?? ""}</td>
      <td className="px-4 py-3 text-right">
        <button onClick={onEdit} className="mr-2 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5">
          <Pencil className="h-4 w-4" />
        </button>
        <button onClick={onDelete} className="rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600">
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}

function EditRow({
  entry,
  pending,
  onSave,
  onCancel,
}: {
  entry: TimeEntry;
  pending: boolean;
  onSave: (input: { started_at: string; ended_at: string | null; note: string | null }) => void;
  onCancel: () => void;
}) {
  const [start, setStart] = useState(toDatetimeLocalValue(new Date(entry.started_at)));
  const [end, setEnd] = useState(entry.ended_at ? toDatetimeLocalValue(new Date(entry.ended_at)) : "");
  const [note, setNote] = useState(entry.note ?? "");

  return (
    <tr className="bg-primary/[0.04]">
      <td colSpan={4} className="px-4 py-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]" />
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]" />
          <input type="text" value={note} placeholder="Notiz" onChange={(e) => setNote(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]" />
        </div>
      </td>
      <td className="px-4 py-3" />
      <td className="px-4 py-3 text-right">
        <button
          onClick={() => onSave({ started_at: new Date(start).toISOString(), ended_at: end ? new Date(end).toISOString() : null, note: note || null })}
          disabled={pending}
          className="mr-2 rounded-md bg-primary p-1.5 text-gray-900 hover:bg-primary-dark disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
        </button>
        <button onClick={onCancel} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5">
          <X className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}
