"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Check, Loader2, Pencil, Trash2, X, MapPin, Phone, User } from "lucide-react";
import {
  toggleLeadTodo,
  updateLeadTodo,
  deleteLeadTodo,
} from "../../crm/actions";
import { formatTime, relativeDueLabel, todayKey } from "../_lib/date-utils";
import { DateTimePopover } from "./date-time-popover";
import { useToastContext } from "../../toast-provider";
import type { TodoWithLead } from "../page";

interface Props {
  todo: TodoWithLead;
  selected: boolean;
  onSelectChange: (selected: boolean) => void;
  /** Besitzer-Name — nur in der „Alle"-Ansicht gesetzt, sonst null. */
  ownerName?: string | null;
}

export function TodoRow({ todo, selected, onSelectChange, ownerName }: Props) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);

  const isDone = !!todo.done_at;
  const dueLabel = relativeDueLabel(todo.due_date, todayKey());
  const dueTime = formatTime(todo.due_time);
  const pillLabel = dueTime ? `${dueLabel.text} · ${dueTime}` : dueLabel.text;

  function handleToggle() {
    startTransition(async () => {
      const res = await toggleLeadTodo(todo.id, todo.lead_id, !isDone);
      if (res.error) addToast(res.error, "error");
      else router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm("ToDo löschen?")) return;
    startTransition(async () => {
      const res = await deleteLeadTodo(todo.id, todo.lead_id);
      if (res.error) addToast(res.error, "error");
      else {
        addToast("ToDo gelöscht", "success");
        router.refresh();
      }
    });
  }

  if (editing) {
    return (
      <TodoRowEditor
        todo={todo}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          router.refresh();
        }}
      />
    );
  }

  const toneClasses: Record<typeof dueLabel.tone, string> = {
    overdue: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    today: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    soon: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    later: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300",
  };

  return (
    <div className="group relative flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/60 dark:hover:bg-white/[0.02]">
      {/* Multi-Select Checkbox (links neben dem Checkmark, klein und subtil) */}
      <input
        type="checkbox"
        checked={selected}
        onChange={(e) => onSelectChange(e.target.checked)}
        onClick={(e) => e.stopPropagation()}
        className="h-3.5 w-3.5 shrink-0 rounded border-gray-300 opacity-0 transition group-hover:opacity-100 focus:opacity-100 dark:border-gray-600"
        aria-label="Auswählen"
        title="Mehrfach auswählen"
      />

      {/* Erledigen-Checkbox */}
      <button
        onClick={handleToggle}
        disabled={pending}
        title={isDone ? "Wieder öffnen" : "Erledigen"}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
          isDone
            ? "border-primary bg-primary text-gray-900"
            : "border-gray-300 hover:border-primary dark:border-[#3a3a3c]"
        }`}
      >
        {isDone && <Check className="h-3 w-3" />}
      </button>

      {/* Titel + Lead-Hinweis */}
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${isDone ? "text-gray-400 line-through" : "text-gray-900 dark:text-gray-100"}`}>
          {todo.title}
        </p>
        {todo.lead && (
          <Link
            href={`/crm/${todo.lead.id}?from=${encodeURIComponent("/todos")}`}
            className="mt-0.5 flex items-center gap-2 truncate text-[11px] text-gray-500 transition hover:text-primary dark:text-gray-400 dark:hover:text-primary"
            title={`Zum Lead: ${todo.lead.company_name}`}
          >
            <Building2 className="h-3 w-3" />
            <span className="truncate hover:underline">{todo.lead.company_name}</span>
            {todo.lead.city && (
              <>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <MapPin className="h-2.5 w-2.5" />
                <span className="truncate">{todo.lead.city}</span>
              </>
            )}
          </Link>
        )}
      </div>

      {/* Datums-Pill mit Quick-Reschedule-Popover */}
      {!isDone && <RescheduleButton todo={todo} toneClass={toneClasses[dueLabel.tone]} label={pillLabel} />}

      {/* Lead-Pill mit Click-to-Call Hover-Detail */}
      {todo.lead && (
        <div className="relative shrink-0">
          <Link
            href={`/crm/${todo.lead.id}?from=${encodeURIComponent("/todos")}`}
            className="inline-flex max-w-[180px] items-center gap-1 rounded-md border border-gray-200 px-2 py-0.5 text-[11px] text-gray-600 transition hover:border-primary/40 hover:bg-primary/5 dark:border-[#2c2c2e] dark:text-gray-300"
            title={`Zum Lead: ${todo.lead.company_name}`}
          >
            <span className="truncate">{todo.lead.company_name}</span>
            {todo.lead.phone && <Phone className="h-2.5 w-2.5 text-primary" />}
          </Link>
        </div>
      )}

      {/* Besitzer-Pille — nur in der „Alle"-Ansicht */}
      {ownerName && (
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 dark:bg-white/5 dark:text-gray-300"
          title={`Erstellt von ${ownerName}`}
        >
          <User className="h-2.5 w-2.5" />
          <span className="max-w-[120px] truncate">{ownerName}</span>
        </span>
      )}

      {/* Hover-Aktionen */}
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
        <button
          onClick={() => setEditing(true)}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5"
          title="Bearbeiten"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleDelete}
          disabled={pending}
          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
          title="Löschen"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

function RescheduleButton({ todo, toneClass, label }: { todo: TodoWithLead; toneClass: string; label: string }) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [draftDate, setDraftDate] = useState(todo.due_date);
  const [draftTime, setDraftTime] = useState<string | null>(formatTime(todo.due_time));

  // Beim Schließen persistieren — nur wenn sich Datum oder Uhrzeit geändert haben.
  function persistAndClose() {
    setOpen(false);
    const changed = draftDate !== todo.due_date || (draftTime ?? null) !== (formatTime(todo.due_time) ?? null);
    if (!changed) return;
    startTransition(async () => {
      const res = await updateLeadTodo(todo.id, todo.lead_id, todo.title, draftDate, draftTime);
      if (res.error) addToast(res.error, "error");
      else {
        addToast("Verschoben", "success");
        router.refresh();
      }
    });
  }

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className={`rounded px-1.5 py-0.5 text-[11px] font-medium transition disabled:opacity-50 ${toneClass}`}
        title="Verschieben — Datum & Uhrzeit"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : label}
      </button>
      {open && (
        <DateTimePopover
          date={draftDate}
          time={draftTime}
          onChange={(d, t) => {
            setDraftDate(d);
            setDraftTime(t);
          }}
          onClose={persistAndClose}
        />
      )}
    </div>
  );
}

function TodoRowEditor({
  todo,
  onClose,
  onSaved,
}: {
  todo: TodoWithLead;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { addToast } = useToastContext();
  const [title, setTitle] = useState(todo.title);
  const [date, setDate] = useState(todo.due_date);
  const [time, setTime] = useState<string | null>(formatTime(todo.due_time));
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!title.trim()) return;
    startTransition(async () => {
      const res = await updateLeadTodo(todo.id, todo.lead_id, title, date, time);
      if (res.error) addToast(res.error, "error");
      else {
        addToast("Gespeichert", "success");
        onSaved();
      }
    });
  }

  return (
    <div className="border-b border-gray-100 bg-primary/5 p-3 dark:border-[#2c2c2e] dark:bg-primary/[0.04]">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-primary">ToDo bearbeiten</p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onClose();
        }}
        className="mt-2 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#161618]"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="text-xs text-gray-500 dark:text-gray-400">Fällig am</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900 dark:border-[#2c2c2e] dark:bg-[#161618] dark:text-gray-100 dark:[color-scheme:dark]"
        />
        <input
          type="time"
          value={time ?? ""}
          onChange={(e) => setTime(e.target.value || null)}
          aria-label="Uhrzeit (optional)"
          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900 dark:border-[#2c2c2e] dark:bg-[#161618] dark:text-gray-100 dark:[color-scheme:dark]"
        />
        {time && (
          <button
            onClick={() => setTime(null)}
            className="text-[11px] text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            title="Uhrzeit entfernen"
          >
            ohne Uhrzeit
          </button>
        )}
        <div className="ml-auto flex gap-2">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5">
            Abbrechen
          </button>
          <button
            onClick={submit}
            disabled={pending || !title.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-primary-dark disabled:opacity-50"
          >
            {pending ? "Speichern…" : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}
