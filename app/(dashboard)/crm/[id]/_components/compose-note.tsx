"use client";

import { useState, useTransition } from "react";
import { StickyNote, X } from "lucide-react";
import { addNote } from "../../actions";
import { useToastContext } from "../../../toast-provider";

export function ComposeNote({
  leadId, onClose, onSaved,
}: { leadId: string; onClose: () => void; onSaved: () => void }) {
  const [content, setContent] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { addToast } = useToastContext();

  function submit() {
    if (!content.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await addNote(leadId, content);
      if (res.error) {
        setError(res.error);
        addToast(res.error, "error");
      } else {
        setContent("");
        addToast("Notiz gespeichert", "success");
        onSaved();
      }
    });
  }

  return (
    <div className="border-b border-gray-100 bg-amber-50/30 p-4 dark:border-[#2c2c2e] dark:bg-amber-900/5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          <StickyNote className="h-3.5 w-3.5" />
          Neue Notiz
        </p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        autoFocus
        placeholder="Was ist passiert? Follow-Up? Beobachtung?"
        className="mt-2 w-full resize-none rounded-md border border-gray-200 bg-white p-2 text-sm dark:border-[#2c2c2e] dark:bg-[#161618]"
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5">
          Abbrechen
        </button>
        <button
          onClick={submit}
          disabled={pending || !content.trim()}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {pending ? "Speichern…" : "Notiz speichern"}
        </button>
      </div>
    </div>
  );
}
