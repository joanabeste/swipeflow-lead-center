"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Eye, ChevronDown, Settings, Sparkles } from "lucide-react";
import { useToastContext } from "../../toast-provider";
import type { LearningCourse, LearningCourseStatus } from "@/lib/types";
import { updateCourse } from "../_actions/courses";
import { SaveIndicator } from "./save-indicator";
import type { AutosaveResult } from "../_hooks/use-autosave";

interface Props {
  course: LearningCourse;
  saveState: AutosaveResult | null;
  onTitleChange: (title: string) => void;
  onAttemptPublish: () => void;
  onToggleAI: () => void;
}

export function EditorTopBar({
  course,
  saveState,
  onTitleChange,
  onAttemptPublish,
  onToggleAI,
}: Props) {
  const { addToast } = useToastContext();
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);

  async function setStatus(status: LearningCourseStatus) {
    setStatusMenuOpen(false);
    if (status === course.status) return;
    if (status === "published") {
      onAttemptPublish();
      return;
    }
    const res = await updateCourse({ id: course.id, status });
    if (res.error) return addToast(res.error, "error");
    addToast("Auf Entwurf zurückgesetzt", "success");
    location.reload();
  }

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2.5 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
      <Link
        href="/learning/admin"
        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5"
        title="Zurück zur Kurs-Verwaltung"
      >
        <ChevronLeft className="h-4 w-4" />
      </Link>

      <div className="flex flex-1 items-baseline gap-2">
        <Link href="/learning/admin" className="text-xs text-gray-400 hover:text-primary">
          Learning
        </Link>
        <span className="text-xs text-gray-300">/</span>
        <input
          defaultValue={course.title}
          key={course.id + ":topbar-title"}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== course.title) onTitleChange(v);
          }}
          className="min-w-0 flex-1 border-0 bg-transparent text-base font-semibold text-gray-900 focus:outline-none dark:text-gray-100"
        />
        {saveState && (
          <SaveIndicator state={saveState.state} lastSavedAt={saveState.lastSavedAt} error={saveState.error} />
        )}
      </div>

      <div className="relative">
        <button
          onClick={() => setStatusMenuOpen((v) => !v)}
          className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium ${
            course.status === "published"
              ? "border border-green-200 bg-green-50 text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-300"
              : "border border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-900/40 dark:bg-yellow-900/20 dark:text-yellow-300"
          }`}
        >
          {course.status === "published" ? "Veröffentlicht" : "Entwurf"}
          <ChevronDown className="h-3 w-3" />
        </button>
        {statusMenuOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setStatusMenuOpen(false)} />
            <div className="absolute right-0 z-40 mt-1 min-w-[180px] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
              <button
                onClick={() => setStatus("draft")}
                className="block w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
              >
                Entwurf — nur für Editoren
              </button>
              <button
                onClick={() => setStatus("published")}
                className="block w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
              >
                Veröffentlichen — für alle Lernenden
              </button>
            </div>
          </>
        )}
      </div>

      <Link
        href={`/learning/${course.slug}`}
        target="_blank"
        className="rounded-lg border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50 dark:border-[#2c2c2e]/50 dark:text-gray-400 dark:hover:bg-white/5"
        title="Vorschau"
      >
        <Eye className="h-4 w-4" />
      </Link>

      <button
        onClick={onToggleAI}
        className="rounded-lg border border-primary/30 bg-primary/5 p-1.5 text-primary hover:bg-primary/10"
        title="AI-Assist"
      >
        <Sparkles className="h-4 w-4" />
      </button>

      <Link
        href={`/learning/admin/${course.id}/einstellungen`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-[#2c2c2e]/50 dark:text-gray-400 dark:hover:bg-white/5"
        title="Kurs-Einstellungen"
      >
        <Settings className="h-3.5 w-3.5" /> Einstellungen
      </Link>
    </header>
  );
}
