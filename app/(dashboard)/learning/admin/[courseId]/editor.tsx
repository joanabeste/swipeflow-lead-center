"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  LearningCategory,
  LearningCourse,
  LearningLesson,
  LearningModule,
  LoadedLearningAttachment,
} from "@/lib/types";
import { updateCourse } from "../../_actions/courses";
import { useAutosave, type AutosaveResult } from "../../_hooks/use-autosave";
import { CurriculumTree } from "../../_components/curriculum-tree";
import { LessonEditorPanel } from "../../_components/lesson-editor-panel";
import { SettingsPanel } from "../../_components/settings-panel";
import { EditorTopBar } from "../../_components/editor-topbar";
import { AIDrawer } from "../../_components/ai-drawer";
import {
  evaluateCourse,
  PublishCheckModal,
} from "../../_components/publish-check-modal";

interface Props {
  course: LearningCourse;
  categories: LearningCategory[];
  modules: LearningModule[];
  lessons: LearningLesson[];
  attachments: Record<string, LoadedLearningAttachment[]>;
  coverPublicBaseUrl: string;
}

type ActiveSelection =
  | { kind: "course" }
  | { kind: "module"; moduleId: string }
  | { kind: "lesson"; lessonId: string };

export function CourseEditor(props: Props) {
  const [course, setCourse] = useState(props.course);
  const [modules, setModules] = useState(props.modules);
  const [lessons, setLessons] = useState(props.lessons);
  const [attachments, setAttachments] = useState(props.attachments);
  const [selection, setSelection] = useState<ActiveSelection>(
    props.lessons[0] ? { kind: "lesson", lessonId: props.lessons[0].id } : { kind: "course" },
  );
  const [showSettings, setShowSettings] = useState(true);
  const [showAI, setShowAI] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [lessonSaveState, setLessonSaveState] = useState<AutosaveResult | null>(null);
  const courseSave = useAutosave(800);

  useEffect(() => {
    if (selection.kind !== "lesson") setLessonSaveState(null);
  }, [selection]);

  const activeLesson = selection.kind === "lesson"
    ? lessons.find((l) => l.id === selection.lessonId) ?? null
    : null;

  const activeAttachments = activeLesson ? attachments[activeLesson.id] ?? [] : [];

  function updateLessonState(next: LearningLesson) {
    setLessons((prev) => prev.map((l) => (l.id === next.id ? next : l)));
  }

  function updateModuleState(next: LearningModule) {
    setModules((prev) => prev.map((m) => (m.id === next.id ? next : m)));
  }

  function updateAttachmentsState(lessonId: string, next: LoadedLearningAttachment[]) {
    setAttachments((prev) => ({ ...prev, [lessonId]: next }));
  }

  function handleTitleChange(title: string) {
    setCourse({ ...course, title });
    courseSave.schedule(async () => updateCourse({ id: course.id, title }));
  }

  const checkItems = useMemo(
    () =>
      evaluateCourse(course, modules, lessons, (lid) => (attachments[lid] ?? []).length),
    [course, modules, lessons, attachments],
  );

  async function handlePublish() {
    setPublishOpen(false);
    const res = await updateCourse({ id: course.id, status: "published" });
    if (!res.error) {
      setCourse({ ...course, status: "published" });
    }
  }

  const topSaveState =
    lessonSaveState ?? (courseSave.state !== "idle" || courseSave.lastSavedAt ? courseSave : null);

  return (
    <div className="-m-8 flex h-[calc(100vh-4rem)] flex-col">
      <EditorTopBar
        course={course}
        saveState={topSaveState}
        onTitleChange={handleTitleChange}
        onAttemptPublish={() => setPublishOpen(true)}
        onToggleSettings={() => setShowSettings((v) => !v)}
        onToggleAI={() => setShowAI((v) => !v)}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Curriculum-Tree (links) */}
        <aside className="flex w-[260px] shrink-0 flex-col border-r border-gray-200 bg-white py-3 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
          <CurriculumTree
            courseId={course.id}
            modules={modules}
            lessons={lessons}
            activeLessonId={activeLesson?.id ?? null}
            onSelectLesson={(id) => setSelection({ kind: "lesson", lessonId: id })}
            onSelectCourse={() => setSelection({ kind: "course" })}
            onChange={({ modules, lessons }) => {
              setModules(modules);
              setLessons(lessons);
            }}
          />
        </aside>

        {/* Editor (Mitte) */}
        <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#0f0f10]">
          {activeLesson ? (
            <LessonEditorPanel
              key={activeLesson.id}
              lesson={activeLesson}
              attachments={activeAttachments}
              onLessonChange={updateLessonState}
              onAttachmentsChange={(next) => updateAttachmentsState(activeLesson.id, next)}
              onSaveStateChange={setLessonSaveState}
            />
          ) : (
            <CourseEmptyState
              courseTitle={course.title}
              hasModules={modules.length > 0}
              onOpenAI={() => setShowAI(true)}
            />
          )}
        </main>

        {/* Settings-Panel (rechts) */}
        {showSettings && (
          <aside className="w-[320px] shrink-0 overflow-y-auto border-l border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
            <SettingsPanel
              mode={selection}
              course={course}
              categories={props.categories}
              modules={modules}
              lessons={lessons}
              coverPublicBaseUrl={props.coverPublicBaseUrl}
              onCourseChange={setCourse}
              onModuleChange={updateModuleState}
              onLessonChange={updateLessonState}
            />
          </aside>
        )}

        {/* AI-Drawer */}
        {showAI && <AIDrawer open={showAI} onClose={() => setShowAI(false)} courseId={course.id} />}
      </div>

      <PublishCheckModal
        open={publishOpen}
        items={checkItems}
        onClose={() => setPublishOpen(false)}
        onPublish={handlePublish}
      />
    </div>
  );
}

function CourseEmptyState({
  courseTitle,
  hasModules,
  onOpenAI,
}: {
  courseTitle: string;
  hasModules: boolean;
  onOpenAI: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md space-y-3 text-center">
        <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-300">{courseTitle}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {hasModules
            ? "Wähle links eine Lektion zum Bearbeiten oder bearbeite den Kurs in den Einstellungen rechts."
            : "Dieser Kurs hat noch keine Inhalte. Lege links das erste Modul an — oder lass dir von AI eine Outline vorschlagen."}
        </p>
        {!hasModules && (
          <button
            onClick={onOpenAI}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition hover:bg-primary-dark"
          >
            ✨ Outline mit AI generieren
          </button>
        )}
      </div>
    </div>
  );
}
