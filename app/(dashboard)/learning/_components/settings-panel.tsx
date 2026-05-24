"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useDialog } from "@/components/dialog";
import { useToastContext } from "../../toast-provider";
import type {
  LearningCategory,
  LearningCourse,
  LearningLesson,
  LearningLessonType,
  LearningModule,
} from "@/lib/types";
import {
  deleteCourse,
  duplicateLesson,
  moveLesson,
  updateCourse,
  updateLesson,
  updateModule,
} from "../_actions/courses";
import { CoverImageUpload } from "./cover-image-upload";
import { LearningObjectivesEditor } from "./learning-objectives-editor";
import { LessonTypeIcon, LESSON_TYPE_LABELS } from "./lesson-type-icon";

const LESSON_TYPES: LearningLessonType[] = ["video", "text", "file", "mixed"];

type Mode =
  | { kind: "course" }
  | { kind: "module"; moduleId: string }
  | { kind: "lesson"; lessonId: string };

interface Props {
  mode: Mode;
  course: LearningCourse;
  categories: LearningCategory[];
  modules: LearningModule[];
  lessons: LearningLesson[];
  coverPublicBaseUrl: string;
  onCourseChange: (next: LearningCourse) => void;
  onModuleChange: (next: LearningModule) => void;
  onLessonChange: (next: LearningLesson) => void;
}

export function SettingsPanel({
  mode,
  course,
  categories,
  modules,
  lessons,
  coverPublicBaseUrl,
  onCourseChange,
  onModuleChange,
  onLessonChange,
}: Props) {
  if (mode.kind === "lesson") {
    const lesson = lessons.find((l) => l.id === mode.lessonId);
    if (!lesson) return null;
    return (
      <LessonSettings
        lesson={lesson}
        modules={modules}
        onChange={onLessonChange}
      />
    );
  }
  if (mode.kind === "module") {
    const module = modules.find((m) => m.id === mode.moduleId);
    if (!module) return null;
    return <ModuleSettings module={module} onChange={onModuleChange} />;
  }
  return (
    <CourseSettings
      course={course}
      categories={categories}
      coverPublicBaseUrl={coverPublicBaseUrl}
      lessonCount={lessons.length}
      totalMinutes={lessons.reduce((s, l) => s + (l.estimated_minutes ?? 0), 0)}
      onChange={onCourseChange}
    />
  );
}

// ─── Course-Settings ──────────────────────────────────────────────

function CourseSettings({
  course,
  categories,
  coverPublicBaseUrl,
  lessonCount,
  totalMinutes,
  onChange,
}: {
  course: LearningCourse;
  categories: LearningCategory[];
  coverPublicBaseUrl: string;
  lessonCount: number;
  totalMinutes: number;
  onChange: (next: LearningCourse) => void;
}) {
  const dialog = useDialog();
  const router = useRouter();
  const { addToast } = useToastContext();

  function patch(next: Partial<LearningCourse>) {
    const merged = { ...course, ...next };
    onChange(merged);
    void updateCourse({ id: course.id, ...next });
  }

  async function handleDelete() {
    const ok = await dialog.confirm({
      title: "Kurs löschen?",
      body: "Inkl. aller Module, Lektionen und Anhänge. Diese Aktion kann nicht rückgängig gemacht werden.",
      danger: true,
      confirmLabel: "Löschen",
    });
    if (!ok) return;
    const res = await deleteCourse(course.id);
    if (res.error) return addToast(res.error, "error");
    router.push("/learning/admin");
  }

  return (
    <div className="space-y-5">
      <Section title="Cover">
        <CoverImageUpload
          courseId={course.id}
          currentPath={course.cover_image_path}
          publicBaseUrl={coverPublicBaseUrl}
        />
      </Section>

      <Section title="Allgemein">
        <Field label="Titel">
          <input
            defaultValue={course.title}
            key={course.id + ":title"}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== course.title) patch({ title: v });
            }}
            className={inputCls}
          />
        </Field>
        <Field label="Slug">
          <input value={course.slug} readOnly className={inputCls + " opacity-60"} />
        </Field>
        <Field label="Kurzbeschreibung">
          <textarea
            defaultValue={course.summary ?? ""}
            key={course.id + ":summary"}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== (course.summary ?? "")) patch({ summary: v || null });
            }}
            className={inputCls + " min-h-[70px]"}
          />
        </Field>
        <Field label="Kategorie">
          <select
            defaultValue={course.category_id ?? ""}
            key={course.id + ":cat"}
            onChange={(e) => patch({ category_id: e.target.value || null })}
            className={inputCls}
          >
            <option value="">— Keine —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="Lernziele">
        <LearningObjectivesEditor
          value={course.learning_objectives ?? []}
          onChange={(next) => patch({ learning_objectives: next })}
        />
      </Section>

      <Section title="Statistik">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-50 p-3 text-xs dark:bg-[#222224]">
          <Stat label="Lektionen" value={String(lessonCount)} />
          <Stat label="Geschätzt" value={totalMinutes > 0 ? `${totalMinutes} Min.` : "—"} />
        </div>
      </Section>

      <Section title="Gefahrenzone">
        <button
          onClick={handleDelete}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-900/20"
        >
          <Trash2 className="h-3.5 w-3.5" /> Kurs löschen
        </button>
      </Section>
    </div>
  );
}

// ─── Lesson-Settings ──────────────────────────────────────────────

function LessonSettings({
  lesson,
  modules,
  onChange,
}: {
  lesson: LearningLesson;
  modules: LearningModule[];
  onChange: (next: LearningLesson) => void;
}) {
  const { addToast } = useToastContext();

  function patch(next: Partial<LearningLesson>) {
    onChange({ ...lesson, ...next });
    void updateLesson({ id: lesson.id, ...next });
  }

  async function handleMove(targetModuleId: string) {
    if (targetModuleId === lesson.module_id) return;
    onChange({ ...lesson, module_id: targetModuleId });
    const res = await moveLesson({
      lessonId: lesson.id,
      targetModuleId,
      sortOrder: 999, // ans Ende
    });
    if (res.error) addToast(res.error, "error");
  }

  async function handleDuplicate() {
    const res = await duplicateLesson(lesson.id);
    if ("error" in res) return addToast(res.error, "error");
    addToast("Lektion dupliziert", "success");
    location.reload();
  }

  return (
    <div className="space-y-5">
      <Section title="Typ">
        <div className="grid grid-cols-2 gap-1">
          {LESSON_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => patch({ lesson_type: t })}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition ${
                lesson.lesson_type === t
                  ? "bg-primary text-gray-900"
                  : "bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-[#222224] dark:text-gray-400 dark:hover:bg-white/5"
              }`}
            >
              <LessonTypeIcon type={t} />
              {LESSON_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Metadaten">
        <Field label="Geschätzte Dauer">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              defaultValue={lesson.estimated_minutes ?? ""}
              key={lesson.id + ":dur"}
              onBlur={(e) => {
                const v = e.target.value ? Number(e.target.value) : null;
                if (v !== lesson.estimated_minutes) patch({ estimated_minutes: v });
              }}
              className={inputCls + " w-20"}
            />
            <span className="text-xs text-gray-400">Minuten</span>
          </div>
        </Field>
        <Field label="Modul">
          <select
            value={lesson.module_id}
            onChange={(e) => handleMove(e.target.value)}
            className={inputCls}
          >
            {modules.map((m) => (
              <option key={m.id} value={m.id}>{m.title}</option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="Editor-Notiz" hint="Nur für Editoren sichtbar, nicht für Lernende.">
        <textarea
          defaultValue={lesson.editor_notes ?? ""}
          key={lesson.id + ":notes"}
          onBlur={(e) => {
            const v = e.target.value;
            if (v !== (lesson.editor_notes ?? "")) patch({ editor_notes: v || null });
          }}
          placeholder="Interne Hinweise…"
          className={inputCls + " min-h-[80px]"}
        />
      </Section>

      <Section title="Aktionen">
        <button
          onClick={handleDuplicate}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-[#2c2c2e]/50 dark:text-gray-300 dark:hover:bg-white/5"
        >
          Lektion duplizieren
        </button>
      </Section>
    </div>
  );
}

// ─── Module-Settings ──────────────────────────────────────────────

function ModuleSettings({
  module,
  onChange,
}: {
  module: LearningModule;
  onChange: (next: LearningModule) => void;
}) {
  function patch(next: Partial<LearningModule>) {
    onChange({ ...module, ...next });
    void updateModule({ id: module.id, ...next });
  }
  return (
    <div className="space-y-5">
      <Section title="Modul">
        <Field label="Titel">
          <input
            defaultValue={module.title}
            key={module.id + ":title"}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== module.title) patch({ title: v });
            }}
            className={inputCls}
          />
        </Field>
        <Field label="Beschreibung" hint="Wird über der Lektions-Liste angezeigt.">
          <textarea
            defaultValue={module.description ?? ""}
            key={module.id + ":desc"}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== (module.description ?? "")) patch({ description: v || null });
            }}
            className={inputCls + " min-h-[80px]"}
          />
        </Field>
      </Section>
    </div>
  );
}

// ─── Primitives ───────────────────────────────────────────────────

const inputCls =
  "block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e] dark:text-gray-100";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <header>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{title}</h3>
        {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
      </header>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-[11px] font-medium text-gray-500 dark:text-gray-400">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-gray-400">{hint}</span>}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-base font-semibold tabular-nums text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  );
}

