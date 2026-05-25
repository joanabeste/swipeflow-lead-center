"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { useToastContext } from "../../toast-provider";
import type { LearningBlock } from "@/lib/types";
import { generateLessonContent, type LessonContentLength } from "../_actions/ai";

interface Props {
  lessonId: string;
  /** Wird mit den generierten Bloecken aufgerufen. */
  onGenerated: (blocks: LearningBlock[]) => void;
  /** Schliesst das Modal (ohne Generierung). */
  onClose: () => void;
  /** Header-Text. "Lektion schreiben" vs "Weitere Bloecke anhaengen". */
  title?: string;
}

const LENGTH_OPTIONS: Array<{ value: LessonContentLength; label: string; hint: string }> = [
  { value: "short", label: "Kurz", hint: "~300 Wörter" },
  { value: "medium", label: "Mittel", hint: "~600 Wörter" },
  { value: "long", label: "Lang", hint: "~1000 Wörter" },
];

export function AIContentModal({ lessonId, onGenerated, onClose, title = "KI-Inhalte schreiben" }: Props) {
  const { addToast } = useToastContext();
  const [length, setLength] = useState<LessonContentLength>("medium");
  const [instruction, setInstruction] = useState("");
  const [pending, start] = useTransition();

  function generate() {
    start(async () => {
      const res = await generateLessonContent({
        lessonId,
        length,
        instruction: instruction.trim() || undefined,
      });
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      onGenerated(res.blocks);
      onClose();
      addToast(`${res.blocks.length} Blöcke generiert`, "success");
    });
  }

  return (
    <div>
      <header className="flex items-start justify-between gap-3 border-b border-gray-100 px-6 py-4 dark:border-[#2c2c2e]/50">
        <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100">
          <Sparkles className="h-4 w-4 text-primary" /> {title}
        </h3>
        <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="space-y-4 px-6 py-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Länge
          </label>
          <div className="mt-2 grid grid-cols-3 gap-1">
            {LENGTH_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setLength(o.value)}
                className={`flex flex-col items-center rounded-xl px-3 py-2 text-xs font-medium transition ${
                  length === o.value
                    ? "bg-primary text-gray-900"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-[#222224] dark:text-gray-400"
                }`}
              >
                {o.label}
                <span
                  className={`text-[10px] ${
                    length === o.value ? "text-gray-900/70" : "text-gray-400"
                  }`}
                >
                  {o.hint}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Zusätzlicher Hinweis (optional)
          </label>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder='z.B. „Mit konkreten Beispielen aus dem Vertriebsalltag“ oder „Eher technisch“'
            rows={3}
            className="mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e] dark:text-gray-100"
          />
        </div>

        <p className="text-[11px] text-gray-400">
          KI nutzt Kurs- und Modul-Kontext (Titel, Beschreibung, Lernziele). Du kannst die generierten Texte
          danach jederzeit anpassen.
        </p>
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-gray-100 px-6 py-3 dark:border-[#2c2c2e]/50">
        <button
          onClick={onClose}
          disabled={pending}
          className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-white/5"
        >
          Abbrechen
        </button>
        <button
          onClick={generate}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-primary-dark disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {pending ? "Generiere…" : "Generieren"}
        </button>
      </footer>
    </div>
  );
}
