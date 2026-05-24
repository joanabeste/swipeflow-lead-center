"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Trash2 } from "lucide-react";
import { useDialog } from "@/components/dialog";
import { useToastContext } from "../../../../toast-provider";
import type { LearningCategory, LearningCourse, LearningCourseStatus } from "@/lib/types";
import { deleteCourse, updateCourse } from "../../../_actions/courses";
import { CoverImageUpload } from "../../../_components/cover-image-upload";
import { LearningObjectivesEditor } from "../../../_components/learning-objectives-editor";

interface Props {
  course: LearningCourse;
  categories: LearningCategory[];
  coverPublicBaseUrl: string;
  lessonCount: number;
  totalMinutes: number;
}

export function SettingsForm({
  course: initial,
  categories,
  coverPublicBaseUrl,
  lessonCount,
  totalMinutes,
}: Props) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const dialog = useDialog();
  const [course, setCourse] = useState(initial);

  function patch(next: Partial<LearningCourse>, msg?: string) {
    setCourse({ ...course, ...next });
    void updateCourse({ id: course.id, ...next }).then((res) => {
      if (res.error) addToast(res.error, "error");
      else if (msg) addToast(msg, "success");
    });
  }

  async function handleStatus(status: LearningCourseStatus) {
    if (status === course.status) return;
    patch({ status }, status === "published" ? "Veröffentlicht" : "Auf Entwurf gesetzt");
  }

  async function handleDelete() {
    const ok = await dialog.confirm({
      title: `Kurs „${course.title}" löschen?`,
      body: "Inklusive aller Module, Lektionen und Anhänge. Diese Aktion kann nicht rückgängig gemacht werden.",
      danger: true,
      confirmLabel: "Löschen",
    });
    if (!ok) return;
    const res = await deleteCourse(course.id);
    if (res.error) return addToast(res.error, "error");
    router.push("/learning/admin");
  }

  const inputCls =
    "block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e] dark:text-gray-100";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <Link
            href={`/learning/admin/${course.id}`}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-primary dark:text-gray-400"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Zurück zum Editor
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Kurs-Einstellungen</h1>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Linke Spalte: Cover + Grunddaten */}
        <div className="space-y-6">
          <Section title="Cover" hint="Aspect 16:9 — wird auf Kurs-Kacheln und im Header angezeigt.">
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
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== course.title) patch({ title: v }, "Titel gespeichert");
                }}
                className={inputCls}
              />
            </Field>
            <Field label="URL-Slug" hint="Kann nicht geändert werden, ohne bestehende Links zu brechen.">
              <input value={course.slug} readOnly className={inputCls + " opacity-60"} />
            </Field>
            <Field label="Kurzbeschreibung" hint="Erscheint in der Kurs-Übersicht.">
              <textarea
                defaultValue={course.summary ?? ""}
                onBlur={(e) => {
                  const v = e.target.value;
                  if (v !== (course.summary ?? "")) patch({ summary: v || null }, "Beschreibung gespeichert");
                }}
                className={inputCls + " min-h-[80px]"}
              />
            </Field>
            <Field label="Kategorie">
              <select
                defaultValue={course.category_id ?? ""}
                onChange={(e) => patch({ category_id: e.target.value || null }, "Kategorie gespeichert")}
                className={inputCls}
              >
                <option value="">— Keine —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
          </Section>
        </div>

        {/* Rechte Spalte: Lernziele + Status + Statistik + Delete */}
        <div className="space-y-6">
          <Section title="Lernziele" hint="Was die Lernenden in diesem Kurs lernen.">
            <LearningObjectivesEditor
              value={course.learning_objectives ?? []}
              onChange={(next) => patch({ learning_objectives: next })}
            />
          </Section>

          <Section title="Status">
            <div className="flex gap-2">
              <button
                onClick={() => handleStatus("draft")}
                className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${
                  course.status === "draft"
                    ? "border border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-900/40 dark:bg-yellow-900/20 dark:text-yellow-300"
                    : "border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-[#2c2c2e]/50 dark:text-gray-400 dark:hover:bg-white/5"
                }`}
              >
                Entwurf
              </button>
              <button
                onClick={() => handleStatus("published")}
                className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${
                  course.status === "published"
                    ? "border border-green-200 bg-green-50 text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-300"
                    : "border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-[#2c2c2e]/50 dark:text-gray-400 dark:hover:bg-white/5"
                }`}
              >
                Veröffentlicht
              </button>
            </div>
            <p className="text-[11px] text-gray-400">
              {course.status === "published"
                ? "Alle Mitarbeiter mit Learning-Zugriff sehen diesen Kurs."
                : "Nur Editoren sehen Entwürfe."}
            </p>
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
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <header>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{title}</h3>
        {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
      </header>
      <div className="space-y-2 rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
        {children}
      </div>
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
