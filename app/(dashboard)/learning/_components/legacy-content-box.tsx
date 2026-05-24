"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Wand2 } from "lucide-react";
import { useToastContext } from "../../toast-provider";
import { convertLegacyToBlocks } from "../_actions/courses";
import { LessonRenderer } from "./lesson-renderer";
import type { LoadedLearningAttachment } from "@/lib/types";

interface Props {
  lessonId: string;
  contentHtml: string;
  attachments: LoadedLearningAttachment[];
  onConverted: () => void;
}

/**
 * Zeigt alten content_html-Inhalt einer Lesson read-only an, plus prominenten
 * „In Blöcke konvertieren"-Button. Klick triggert die Server-Action und reloaded
 * den Editor mit den neuen Blöcken.
 */
export function LegacyContentBox({ lessonId, contentHtml, attachments, onConverted }: Props) {
  const { addToast } = useToastContext();
  const router = useRouter();
  const [pending, start] = useTransition();

  function handleConvert() {
    start(async () => {
      const res = await convertLegacyToBlocks(lessonId);
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      addToast(`${res.blocks.length} Blöcke erstellt.`, "success");
      onConverted();
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-yellow-200 bg-yellow-50/50 p-4 dark:border-yellow-900/40 dark:bg-yellow-900/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
          <div>
            <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-300">
              Diese Lektion nutzt noch das alte Format
            </p>
            <p className="text-xs text-yellow-700/80 dark:text-yellow-400/80">
              Konvertiere sie in die neue Block-Struktur, um sie zu bearbeiten.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleConvert}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-primary-dark disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          In Blöcke konvertieren
        </button>
      </div>
      <div className="rounded-xl border border-yellow-200/60 bg-white p-4 opacity-90 dark:border-yellow-900/30 dark:bg-[#1c1c1e]">
        <LessonRenderer html={contentHtml} attachments={attachments} />
      </div>
    </div>
  );
}
