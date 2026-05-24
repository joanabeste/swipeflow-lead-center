"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Settings, Video, FileText, Paperclip, Layers } from "lucide-react";
import type {
  LearningCourse,
  LearningLesson,
  LearningModule,
  LoadedLearningAttachment,
} from "@/lib/types";
import { updateCourse } from "../../_actions/courses";
import { useAutosave, type AutosaveResult } from "../../_hooks/use-autosave";
import { CurriculumTree } from "../../_components/curriculum-tree";
import { NotionLessonEditor } from "../../_components/notion-editor";
import { EditorTopBar } from "../../_components/editor-topbar";
import { AIDrawer } from "../../_components/ai-drawer";
import { evaluateCourse, PublishCheckModal } from "../../_components/publish-check-modal";

interface Props {
  course: LearningCourse;
  modules: LearningModule[];
  lessons: LearningLesson[];
  attachments: Record<string, LoadedLearningAttachment[]>;
}

export function CourseEditor(props: Props) {
  const [course, setCourse] = useState(props.course);
  const [modules, setModules] = useState(props.modules);
  const [lessons, setLessons] = useState(props.lessons);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(
    props.lessons[0]?.id ?? null,
  );
  const [showAI, setShowAI] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [lessonSaveState, setLessonSaveState] = useState<AutosaveResult | null>(null);
  const courseSave = useAutosave(800);

  useEffect(() => {
    if (activeLessonId === null) setLessonSaveState(null);
  }, [activeLessonId]);

  const activeLesson = activeLessonId
    ? lessons.find((l) => l.id === activeLessonId) ?? null
    : null;

  const activeAttachments = activeLesson ? props.attachments[activeLesson.id] ?? [] : [];

  function updateLessonState(next: LearningLesson) {
    setLessons((prev) => prev.map((l) => (l.id === next.id ? next : l)));
  }

  function handleTitleChange(title: string) {
    setCourse({ ...course, title });
    courseSave.schedule(async () => updateCourse({ id: course.id, title }));
  }

  const checkItems = useMemo(
    () =>
      evaluateCourse(course, modules, lessons, (lid) => (props.attachments[lid] ?? []).length),
    [course, modules, lessons, props.attachments],
  );

  async function handlePublish() {
    setPublishOpen(false);
    const res = await updateCourse({ id: course.id, status: "published" });
    if (!res.error) setCourse({ ...course, status: "published" });
  }

  const topSaveState =
    lessonSaveState ??
    (courseSave.state !== "idle" || courseSave.lastSavedAt ? courseSave : null);

  return (
    <div className="-m-8 flex h-[calc(100vh-4rem)] flex-col">
      <EditorTopBar
        course={course}
        saveState={topSaveState}
        onTitleChange={handleTitleChange}
        onAttemptPublish={() => setPublishOpen(true)}
        onToggleAI={() => setShowAI((v) => !v)}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Curriculum-Tree (links) */}
        <aside className="flex w-[240px] shrink-0 flex-col border-r border-gray-200 bg-white py-3 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
          <CurriculumTree
            courseId={course.id}
            modules={modules}
            lessons={lessons}
            activeLessonId={activeLesson?.id ?? null}
            onSelectLesson={(id) => setActiveLessonId(id)}
            onSelectCourse={() => setActiveLessonId(null)}
            onChange={({ modules, lessons }) => {
              setModules(modules);
              setLessons(lessons);
            }}
          />
        </aside>

        {/* Editor (Mitte) */}
        <main className="flex-1 overflow-y-auto bg-white dark:bg-[#0f0f10]">
          {activeLesson ? (
            <NotionLessonEditor
              key={activeLesson.id}
              lesson={activeLesson}
              initialAttachments={activeAttachments}
              onLessonChange={updateLessonState}
              onSaveStateChange={setLessonSaveState}
            />
          ) : (
            <CourseEmptyState
              courseId={course.id}
              courseTitle={course.title}
              hasModules={modules.length > 0}
              onOpenAI={() => setShowAI(true)}
            />
          )}
        </main>

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

const LESSON_TYPE_CARDS = [
  { icon: Video, title: "Video", body: "YouTube oder Loom einbetten — perfekt für Walk-throughs." },
  { icon: FileText, title: "Text", body: "Schreibe mit Slash-Commands wie in Notion." },
  { icon: Paperclip, title: "Datei", body: "PDFs, Slides oder Worksheets als Download." },
  { icon: Layers, title: "Gemischt", body: "Video + Text + Datei in einer Lektion kombinieren." },
];

function CourseEmptyState({
  courseId,
  courseTitle,
  hasModules,
  onOpenAI,
}: {
  courseId: string;
  courseTitle: string;
  hasModules: boolean;
  onOpenAI: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-2xl space-y-6 text-center">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-300">{courseTitle}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {hasModules
              ? "Wähle links eine Lektion zum Bearbeiten — oder lege eine neue an."
              : "Dieser Kurs hat noch keine Inhalte. Lege links das erste Modul an — oder lass dir eine Outline vorschlagen."}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {LESSON_TYPE_CARDS.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-xl border border-gray-200 bg-gray-50/50 p-3 text-left dark:border-[#2c2c2e]/50 dark:bg-white/[0.02]"
            >
              <Icon className="h-4 w-4 text-primary" />
              <p className="mt-2 text-xs font-semibold text-gray-700 dark:text-gray-200">{title}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-gray-500 dark:text-gray-400">{body}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={onOpenAI}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition hover:bg-primary-dark"
          >
            ✨ {hasModules ? "Outline mit KI erweitern" : "Outline mit KI generieren"}
          </button>
          <Link
            href={`/learning/admin/${courseId}/einstellungen`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-[#2c2c2e]/50 dark:text-gray-300 dark:hover:bg-white/5"
          >
            <Settings className="h-3.5 w-3.5" /> Kurs-Einstellungen
          </Link>
        </div>

        {hasModules && (
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            Tipp: Mit <kbd className="rounded border border-gray-200 bg-gray-50 px-1 py-0.5 text-[10px] dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">↑</kbd> /
            {" "}<kbd className="rounded border border-gray-200 bg-gray-50 px-1 py-0.5 text-[10px] dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">↓</kbd> durch Lektionen springen.
          </p>
        )}
      </div>
    </div>
  );
}
