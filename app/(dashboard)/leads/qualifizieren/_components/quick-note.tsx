"use client";

import { useState, useTransition } from "react";
import { StickyNote } from "lucide-react";
import { addNote } from "@/app/(dashboard)/crm/actions";
import { useToastContext } from "@/app/(dashboard)/toast-provider";
import type { LeadNoteWithDetails } from "@/lib/types";

interface Props {
  leadId: string;
  notes: LeadNoteWithDetails[];
}

interface LocalNote {
  id: string;
  content: string;
  author: string | null;
  created_at: string;
}

/**
 * Kompaktes Notizfeld fürs Qualifizierungs-Cockpit. Speichern per Button oder
 * ⌘/Strg+Enter. Nutzt die bestehende `addNote`-Action; neue Notizen werden
 * optimistisch oben angehängt, damit die Liste ohne Reload aktuell ist.
 */
export function QuickNote({ leadId, notes }: Props) {
  const { addToast } = useToastContext();
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState<LocalNote[]>(() => toLocal(notes));

  // Pro Lead frisch initialisiert: das Cockpit rendert QuickNote mit key={leadId}
  // und erst, sobald das Bundle zum aktuellen Lead geladen ist — daher kein
  // Reset-Effekt nötig (vermeidet kaskadierende Renders).

  function save() {
    const content = text.trim();
    if (!content || pending) return;
    startTransition(async () => {
      const res = await addNote(leadId, content, []);
      if (res && "error" in res && res.error) {
        addToast(`Fehler: ${res.error}`, "error");
        return;
      }
      const created = (res as { note?: { id?: string; created_at?: string } }).note;
      setItems((prev) => [
        {
          id: created?.id ?? `tmp-${prev.length}`,
          content,
          author: "Du",
          created_at: created?.created_at ?? new Date().toISOString(),
        },
        ...prev,
      ]);
      setText("");
      addToast("Notiz gespeichert", "success");
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <StickyNote className="h-4 w-4 text-primary" />
        Notizen
      </h3>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            save();
          }
        }}
        rows={3}
        placeholder="Schnelle Notiz… (⌘/Strg+Enter)"
        className="mt-2 w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#161618]"
      />
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={pending || !text.trim()}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-gray-900 transition hover:bg-primary-dark disabled:opacity-40"
        >
          {pending ? "Speichert…" : "Speichern"}
        </button>
      </div>

      {items.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-gray-100 pt-3 dark:border-[#2c2c2e]">
          {items.slice(0, 6).map((n) => (
            <li key={n.id} className="text-sm">
              <p className="whitespace-pre-wrap text-gray-700 dark:text-gray-300">{n.content}</p>
              <p className="mt-0.5 text-xs text-gray-400">
                {n.author ? `${n.author} · ` : ""}
                {new Date(n.created_at).toLocaleDateString("de-DE", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function toLocal(notes: LeadNoteWithDetails[]): LocalNote[] {
  return notes.map((n) => ({
    id: n.id,
    content: n.content,
    author: n.profiles?.name ?? null,
    created_at: n.created_at,
  }));
}
