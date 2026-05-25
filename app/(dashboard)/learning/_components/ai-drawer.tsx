"use client";

import { useState, useTransition } from "react";
import { Sparkles, X, Loader2, ArrowRight } from "lucide-react";
import { useToastContext } from "../../toast-provider";
import { useDialog } from "@/components/dialog";
import {
  applyOutlineToCourse,
  generateCourseOutline,
  type CourseOutline,
} from "../_actions/ai";
import { LessonTypeIcon, LESSON_TYPE_LABELS } from "./lesson-type-icon";

interface Props {
  open: boolean;
  onClose: () => void;
  courseId: string;
}

export function AIDrawer({ open, onClose, courseId }: Props) {
  const { addToast } = useToastContext();
  const dialog = useDialog();
  const [prompt, setPrompt] = useState("");
  const [moduleCount, setModuleCount] = useState(4);
  const [lessonsPerModule, setLessonsPerModule] = useState(3);
  const [outline, setOutline] = useState<CourseOutline | null>(null);
  const [withContent, setWithContent] = useState(false);
  const [pending, start] = useTransition();
  const [applying, setApplying] = useState(false);

  if (!open) return null;

  function handleGenerate() {
    start(async () => {
      const res = await generateCourseOutline({ prompt, moduleCount, lessonsPerModule });
      if ("error" in res) return addToast(res.error, "error");
      setOutline(res.outline);
    });
  }

  async function handleApply() {
    if (!outline) return;
    const ok = await dialog.confirm({
      title: "Outline anwenden?",
      body: `Es werden ${outline.modules.length} Module mit insgesamt ${outline.modules.reduce(
        (s, m) => s + m.lessons.length,
        0,
      )} Lektionen am Ende deines Kurses angelegt.`,
      confirmLabel: "Anwenden",
    });
    if (!ok) return;
    setApplying(true);
    const res = await applyOutlineToCourse({ courseId, outline, withContent });
    setApplying(false);
    if ("error" in res) return addToast(res.error, "error");
    const msg = withContent
      ? `${res.moduleCount} Module + ${res.lessonCount} Lektionen angelegt · ${res.contentGenerated} Inhalte geschrieben`
      : `${res.moduleCount} Module + ${res.lessonCount} Lektionen angelegt`;
    addToast(msg, "success");
    onClose();
    location.reload();
  }

  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
      <header className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-[#2c2c2e]/50">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
          <Sparkles className="h-4 w-4 text-primary" /> AI-Assist
        </h2>
        <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {!outline ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Worum geht es im Kurs?
              </label>
              <p className="mt-1 text-[11px] text-gray-400">
                Beschreibe das Thema mit ein paar Stichworten — Claude erstellt eine Modul-Outline.
              </p>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder='z.B. „Vertriebs-Onboarding mit Telefonakquise, CRM-Pflege und Einwandbehandlung für neue Mitarbeiter“'
                className="mt-2 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e] min-h-[100px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Module" value={moduleCount} min={2} max={8} onChange={setModuleCount} />
              <NumberField label="Lekt. / Modul" value={lessonsPerModule} min={2} max={8} onChange={setLessonsPerModule} />
            </div>
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() || pending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition hover:bg-primary-dark disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {pending ? "Generiere…" : "Outline generieren"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Vorschau</h3>
              <button
                onClick={() => setOutline(null)}
                className="text-[10px] text-gray-400 hover:text-primary"
              >
                Neu generieren
              </button>
            </div>
            <div className="space-y-2">
              {outline.modules.map((m, i) => (
                <div key={i} className="rounded-xl border border-gray-200 bg-white p-3 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{m.title}</p>
                  {m.description && <p className="mt-0.5 text-[11px] text-gray-500">{m.description}</p>}
                  <ul className="mt-2 space-y-1">
                    {m.lessons.map((l, j) => (
                      <li key={j} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                        <LessonTypeIcon type={l.lesson_type} className="h-3 w-3 text-gray-400" />
                        <span className="flex-1 truncate">{l.title}</span>
                        <span className="text-[10px] uppercase text-gray-300">
                          {LESSON_TYPE_LABELS[l.lesson_type]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <label className="flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs dark:border-[#2c2c2e]/50 dark:bg-[#222224]">
              <input
                type="checkbox"
                checked={withContent}
                onChange={(e) => setWithContent(e.target.checked)}
                disabled={applying}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span>
                <span className="block font-medium text-gray-900 dark:text-gray-100">
                  ✨ Auch fertige Texte schreiben
                </span>
                <span className="block text-[10px] text-gray-500 dark:text-gray-400">
                  KI füllt jede Lektion mit Text-Blöcken. Dauert ~30 s pro Lektion.
                </span>
              </span>
            </label>
            <button
              onClick={handleApply}
              disabled={applying}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition hover:bg-primary-dark disabled:opacity-50"
            >
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {applying ? (withContent ? "Schreibe Inhalte…" : "Wende an…") : "Outline auf Kurs anwenden"}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-gray-500 dark:text-gray-400">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]"
      />
    </label>
  );
}
