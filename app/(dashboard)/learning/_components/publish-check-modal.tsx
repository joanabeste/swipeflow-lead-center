"use client";

import { useEffect, useState } from "react";
import { Check, AlertCircle, AlertTriangle, X } from "lucide-react";
import { createPortal } from "react-dom";
import type { LearningCourse, LearningLesson, LearningModule, LoadedLearningAttachment } from "@/lib/types";

interface CheckItem {
  label: string;
  status: "ok" | "warn" | "blocker";
  hint?: string;
}

export function evaluateCourse(
  course: LearningCourse,
  modules: LearningModule[],
  lessons: LearningLesson[],
  attachmentCount: (lessonId: string) => number,
): CheckItem[] {
  const items: CheckItem[] = [];

  items.push({
    label: "Kurs hat Cover-Bild",
    status: course.cover_image_path ? "ok" : "warn",
    hint: !course.cover_image_path ? "Ohne Cover wirkt der Kurs nackt auf der Übersicht." : undefined,
  });
  items.push({
    label: "Kurs hat Kurzbeschreibung",
    status: (course.summary ?? "").trim() ? "ok" : "warn",
  });
  items.push({
    label: "Kurs hat ≥ 1 Lernziel",
    status: (course.learning_objectives?.length ?? 0) > 0 ? "ok" : "warn",
  });

  if (modules.length === 0) {
    items.push({
      label: "Mindestens 1 Modul",
      status: "blocker",
      hint: "Lege ein Modul an, um zu veröffentlichen.",
    });
  } else if (lessons.length === 0) {
    items.push({
      label: "Mindestens 1 Lektion",
      status: "blocker",
      hint: "Module dürfen nicht leer sein.",
    });
  } else {
    items.push({ label: `${modules.length} Module mit ${lessons.length} Lektionen`, status: "ok" });
  }

  for (const l of lessons) {
    if (!l.title.trim()) {
      items.push({ label: `Lektion ohne Titel (#${l.id.slice(0, 6)})`, status: "blocker" });
      continue;
    }
    const hasBlocks = (l.blocks?.length ?? 0) > 0;
    const hasText = (l.content_html ?? "").replace(/<[^>]*>/g, "").trim().length > 0;
    const hasEmbed =
      (l.content_html ?? "").includes("data-loom-id") ||
      (l.content_html ?? "").includes("data-youtube-video") ||
      (l.content_html ?? "").includes("data-learning-file");
    const hasLegacyVideo = Boolean(l.video_url);
    const hasLegacyFile = attachmentCount(l.id) > 0;
    if (!hasBlocks && !hasText && !hasEmbed && !hasLegacyVideo && !hasLegacyFile) {
      items.push({ label: `„${l.title}": komplett leer`, status: "blocker" });
    }
  }

  return items;
}

export function PublishCheckModal({
  open,
  items,
  onClose,
  onPublish,
}: {
  open: boolean;
  items: CheckItem[];
  onClose: () => void;
  onPublish: () => void;
}) {
  const hasBlocker = items.some((i) => i.status === "blocker");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-[#1c1c1e]"
      >
        <header className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-[#2c2c2e]/50">
          <h3 className="text-base font-semibold">Veröffentlichungs-Check</h3>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5">
            <X className="h-4 w-4" />
          </button>
        </header>
        <ul className="max-h-[400px] divide-y divide-gray-100 overflow-y-auto dark:divide-[#2c2c2e]/50">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-3 px-6 py-3">
              <StatusIcon status={it.status} />
              <div className="flex-1">
                <p
                  className={`text-sm ${
                    it.status === "blocker"
                      ? "text-red-600 dark:text-red-400"
                      : it.status === "warn"
                        ? "text-yellow-700 dark:text-yellow-400"
                        : "text-gray-700 dark:text-gray-300"
                  }`}
                >
                  {it.label}
                </p>
                {it.hint && <p className="text-xs text-gray-400">{it.hint}</p>}
              </div>
            </li>
          ))}
        </ul>
        <footer className="flex items-center justify-between gap-2 border-t border-gray-100 px-6 py-3 dark:border-[#2c2c2e]/50">
          <p className="text-xs text-gray-500">
            {hasBlocker
              ? "Bitte zuerst Blocker beheben."
              : "Empfehlungen sind optional — du kannst trotzdem veröffentlichen."}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
            >
              Abbrechen
            </button>
            <button
              onClick={onPublish}
              disabled={hasBlocker}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition hover:bg-primary-dark disabled:opacity-50"
            >
              Veröffentlichen
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function StatusIcon({ status }: { status: CheckItem["status"] }) {
  if (status === "ok") return <Check className="h-4 w-4 shrink-0 text-green-500" />;
  if (status === "warn") return <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-500" />;
  return <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />;
}

// re-export typing used by props
export type { LoadedLearningAttachment };
