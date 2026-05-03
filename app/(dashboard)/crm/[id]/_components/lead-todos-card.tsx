"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, ChevronDown, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";
import type { LeadTodo } from "@/lib/types";
import { addLeadTodo, deleteLeadTodo, toggleLeadTodo, updateLeadTodo } from "../../actions";
import { useToastContext } from "../../../toast-provider";

interface Props {
  leadId: string;
  todos: LeadTodo[];
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dueLabel(due: string): { text: string; tone: "overdue" | "today" | "soon" | "later" } {
  const today = todayKey();
  if (due < today) {
    const days = Math.floor((Date.parse(today) - Date.parse(due)) / 86400_000);
    return { text: days === 1 ? "Gestern fällig" : `${days} Tage überfällig`, tone: "overdue" };
  }
  if (due === today) return { text: "Heute fällig", tone: "today" };
  const diff = Math.floor((Date.parse(due) - Date.parse(today)) / 86400_000);
  if (diff === 1) return { text: "Morgen", tone: "soon" };
  if (diff <= 7) return { text: `In ${diff} Tagen`, tone: "soon" };
  // Anzeige als TT.MM.JJJJ
  const [y, m, d] = due.split("-");
  return { text: `${d}.${m}.${y}`, tone: "later" };
}

function toneClasses(tone: "overdue" | "today" | "soon" | "later"): string {
  switch (tone) {
    case "overdue": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "today":   return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
    case "soon":    return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
    case "later":   return "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300";
  }
}

export function LeadTodosCard({ leadId, todos }: Props) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();
  const [composing, setComposing] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { open, done } = useMemo(() => {
    const o: LeadTodo[] = [];
    const d: LeadTodo[] = [];
    for (const t of todos) (t.done_at ? d : o).push(t);
    o.sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0));
    d.sort((a, b) => ((b.done_at ?? "") < (a.done_at ?? "") ? -1 : 1));
    return { open: o, done: d };
  }, [todos]);

  function refresh() { router.refresh(); }

  function handleToggle(todoId: string, nextDone: boolean) {
    startTransition(async () => {
      const res = await toggleLeadTodo(todoId, leadId, nextDone);
      if (res.error) addToast(res.error, "error");
      else refresh();
    });
  }

  function handleDelete(todoId: string) {
    if (!confirm("Aufgabe löschen?")) return;
    startTransition(async () => {
      const res = await deleteLeadTodo(todoId, leadId);
      if (res.error) addToast(res.error, "error");
      else { addToast("Aufgabe gelöscht", "success"); refresh(); }
    });
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-[#2c2c2e]">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <CalendarClock className="h-3.5 w-3.5 text-primary" />
          Aufgaben
          {open.length > 0 && (
            <span className="ml-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
              {open.length}
            </span>
          )}
        </h2>
        {!composing && (
          <button
            onClick={() => setComposing(true)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
          >
            <Plus className="h-3.5 w-3.5" />
            Aufgabe
          </button>
        )}
      </div>

      {composing && (
        <TodoComposer
          leadId={leadId}
          onClose={() => setComposing(false)}
          onSaved={() => { setComposing(false); refresh(); }}
        />
      )}

      {open.length === 0 && !composing ? (
        <p className="px-4 py-6 text-center text-sm text-gray-400">
          Keine offenen Aufgaben. Lege eine Wiedervorlage mit Datum an.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-[#2c2c2e]">
          {open.map((t) => (
            <li key={t.id}>
              {editingId === t.id ? (
                <TodoComposer
                  leadId={leadId}
                  initial={t}
                  onClose={() => setEditingId(null)}
                  onSaved={() => { setEditingId(null); refresh(); }}
                />
              ) : (
                <TodoRow
                  todo={t}
                  pending={pending}
                  onToggle={() => handleToggle(t.id, true)}
                  onEdit={() => setEditingId(t.id)}
                  onDelete={() => handleDelete(t.id)}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <div className="border-t border-gray-100 dark:border-[#2c2c2e]">
          <button
            onClick={() => setShowDone((s) => !s)}
            className="flex w-full items-center gap-1.5 px-4 py-2 text-xs text-gray-500 hover:bg-gray-50 dark:hover:bg-white/[0.02]"
          >
            {showDone ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {done.length} erledigt
          </button>
          {showDone && (
            <ul className="divide-y divide-gray-100 dark:divide-[#2c2c2e]">
              {done.map((t) => (
                <li key={t.id}>
                  <TodoRow
                    todo={t}
                    pending={pending}
                    completed
                    onToggle={() => handleToggle(t.id, false)}
                    onEdit={() => setEditingId(t.id)}
                    onDelete={() => handleDelete(t.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function TodoRow({
  todo, pending, completed = false, onToggle, onEdit, onDelete,
}: {
  todo: LeadTodo;
  pending: boolean;
  completed?: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const due = dueLabel(todo.due_date);
  return (
    <div className="group flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/60 dark:hover:bg-white/[0.02]">
      <button
        onClick={onToggle}
        disabled={pending}
        title={completed ? "Wieder öffnen" : "Erledigen"}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
          completed
            ? "border-primary bg-primary text-gray-900"
            : "border-gray-300 hover:border-primary dark:border-[#3a3a3c]"
        }`}
      >
        {completed && <Check className="h-3 w-3" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${completed ? "text-gray-400 line-through" : "text-gray-900 dark:text-gray-100"}`}>
          {todo.title}
        </p>
      </div>
      {!completed && (
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${toneClasses(due.tone)}`}>
          {due.text}
        </span>
      )}
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
        <button
          onClick={onEdit}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5"
          title="Bearbeiten"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
          title="Löschen"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function TodoComposer({
  leadId, initial, onClose, onSaved,
}: {
  leadId: string;
  initial?: LeadTodo;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { addToast } = useToastContext();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [dueDate, setDueDate] = useState(initial?.due_date ?? todayKey());
  const [pending, startTransition] = useTransition();
  const isEdit = !!initial;

  function submit() {
    if (!title.trim()) return;
    startTransition(async () => {
      const res = isEdit
        ? await updateLeadTodo(initial!.id, leadId, title, dueDate)
        : await addLeadTodo(leadId, title, dueDate);
      if (res.error) addToast(res.error, "error");
      else {
        addToast(isEdit ? "Aufgabe aktualisiert" : "Aufgabe gespeichert", "success");
        onSaved();
      }
    });
  }

  return (
    <div className="border-b border-gray-100 bg-primary/5 p-3 dark:border-[#2c2c2e] dark:bg-primary/[0.04]">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-primary">
          {isEdit ? "Aufgabe bearbeiten" : "Neue Aufgabe"}
        </p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus={!isEdit}
        placeholder="z. B. nochmal anrufen, Angebot nachfassen…"
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        className="mt-2 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#161618]"
      />
      <div className="mt-2 flex items-center gap-2">
        <label className="text-xs text-gray-500 dark:text-gray-400">Fällig am</label>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs dark:border-[#2c2c2e] dark:bg-[#161618]"
        />
        <div className="ml-auto flex gap-2">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"
          >
            Abbrechen
          </button>
          <button
            onClick={submit}
            disabled={pending || !title.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-primary-dark disabled:opacity-50"
          >
            {pending ? "Speichern…" : isEdit ? "Speichern" : "Anlegen"}
          </button>
        </div>
      </div>
    </div>
  );
}
