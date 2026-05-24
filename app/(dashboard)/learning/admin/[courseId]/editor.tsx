"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2, Plus, GripVertical, ExternalLink, Eye, FileText, Paperclip } from "lucide-react";
import type {
  LearningCourse,
  LearningCategory,
  LearningCourseStatus,
  LearningLesson,
  LearningModule,
  LoadedLearningAttachment,
} from "@/lib/types";
import {
  createLesson,
  createModule,
  deleteCourse,
  deleteLesson,
  deleteModule,
  updateCourse,
  updateLesson,
  updateModule,
} from "../../_actions/courses";
import {
  createLessonUploadTickets,
  registerLessonUpload,
  deleteLessonAttachment,
} from "../../_actions/attachments";
import { uploadFileToLearningTicket } from "../../_lib/client-upload";
import { LEARNING_ATTACHMENT_ACCEPT, formatBytes, parseVideoUrl } from "../../_lib/format";
import { LessonEditor } from "../../_components/lesson-editor";
import { useToastContext } from "../../../toast-provider";

interface Props {
  course: LearningCourse;
  categories: LearningCategory[];
  modules: LearningModule[];
  lessons: LearningLesson[];
  attachments: Record<string, LoadedLearningAttachment[]>;
}

export function CourseEditor({ course, categories, modules: initialModules, lessons: initialLessons, attachments: initialAttachments }: Props) {
  const router = useRouter();
  const [course_, setCourse] = useState(course);
  const [modules, setModules] = useState(initialModules);
  const [lessons, setLessons] = useState(initialLessons);
  const [attachments, setAttachments] = useState(initialAttachments);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(initialLessons[0]?.id ?? null);
  const [, start] = useTransition();
  const [saving, setSaving] = useState<string | null>(null);
  const { addToast } = useToastContext();

  const inputCls =
    "block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e] dark:text-gray-100";

  // ─── Kurs-Metadaten ──────────────────────────────────────────────
  async function saveCourseField<K extends keyof LearningCourse>(field: K, value: LearningCourse[K]) {
    setCourse({ ...course_, [field]: value });
    setSaving(field as string);
    const res = await updateCourse({ id: course_.id, [field]: value } as Parameters<typeof updateCourse>[0]);
    setSaving(null);
    if (res.error) addToast(res.error, "error");
  }

  async function togglePublish() {
    const newStatus: LearningCourseStatus = course_.status === "published" ? "draft" : "published";
    await saveCourseField("status", newStatus);
  }

  async function handleDeleteCourse() {
    if (!confirm("Diesen Kurs inkl. aller Module und Lektionen wirklich löschen?")) return;
    const res = await deleteCourse(course_.id);
    if (res.error) {
      addToast(res.error, "error");
      return;
    }
    addToast("Kurs gelöscht", "success");
    router.push("/learning/admin");
  }

  // ─── Module ──────────────────────────────────────────────────────
  async function handleAddModule() {
    const title = window.prompt("Modul-Titel?");
    if (!title?.trim()) return;
    const res = await createModule({ course_id: course_.id, title });
    if ("error" in res) {
      addToast(res.error, "error");
      return;
    }
    setModules([...modules, res.module]);
    addToast("Modul angelegt", "success");
  }

  async function handleRenameModule(m: LearningModule) {
    const title = window.prompt("Modul-Titel ändern", m.title);
    if (!title?.trim() || title === m.title) return;
    setModules(modules.map((x) => (x.id === m.id ? { ...x, title } : x)));
    const res = await updateModule({ id: m.id, title });
    if (res.error) addToast(res.error, "error");
    else addToast("Modul umbenannt", "success");
  }

  async function handleDeleteModule(m: LearningModule) {
    if (!confirm(`Modul "${m.title}" und alle Lektionen darin löschen?`)) return;
    setModules(modules.filter((x) => x.id !== m.id));
    setLessons(lessons.filter((l) => l.module_id !== m.id));
    const res = await deleteModule(m.id);
    if (res.error) addToast(res.error, "error");
    else addToast("Modul gelöscht", "success");
  }

  // ─── Lektionen ───────────────────────────────────────────────────
  async function handleAddLesson(moduleId: string) {
    const title = window.prompt("Lektions-Titel?");
    if (!title?.trim()) return;
    const res = await createLesson({ module_id: moduleId, title });
    if ("error" in res) {
      addToast(res.error, "error");
      return;
    }
    setLessons([...lessons, res.lesson]);
    setActiveLessonId(res.lesson.id);
    addToast("Lektion angelegt", "success");
  }

  async function handleDeleteLesson(lessonId: string) {
    if (!confirm("Lektion löschen?")) return;
    setLessons(lessons.filter((l) => l.id !== lessonId));
    if (activeLessonId === lessonId) setActiveLessonId(null);
    const res = await deleteLesson(lessonId);
    if (res.error) addToast(res.error, "error");
    else addToast("Lektion gelöscht", "success");
  }

  function updateLessonLocal(id: string, patch: Partial<LearningLesson>) {
    setLessons(lessons.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  // Persistente Speicherung der Lektion (mit Debounce-style flag — hier einfach: alle Felder synchron speichern).
  function pushLesson(id: string, patch: Omit<Parameters<typeof updateLesson>[0], "id">) {
    start(async () => {
      const res = await updateLesson({ ...patch, id });
      if (res.error) addToast(res.error, "error");
      else addToast("Gespeichert", "success");
    });
  }

  // ─── Anhänge ─────────────────────────────────────────────────────
  async function handleUploadAttachment(lessonId: string, file: File) {
    const clientId = crypto.randomUUID();
    const ticketRes = await createLessonUploadTickets({
      lessonId,
      files: [{ clientId, fileName: file.name, mimeType: file.type, sizeBytes: file.size }],
    });
    if ("error" in ticketRes) {
      addToast(ticketRes.error, "error");
      return;
    }
    if (ticketRes.errors.length > 0) {
      addToast(ticketRes.errors[0].error, "error");
      return;
    }
    const up = await uploadFileToLearningTicket(ticketRes.tickets[0], file);
    if ("error" in up) {
      addToast(up.error, "error");
      return;
    }
    const reg = await registerLessonUpload({ lessonId, ref: up.ref });
    if ("error" in reg) {
      addToast(reg.error, "error");
      return;
    }
    // Optimistisch in den State einfuegen — ohne signed_url, refresh holt den Rest.
    setAttachments({
      ...attachments,
      [lessonId]: [
        ...(attachments[lessonId] ?? []),
        {
          id: reg.attachment.id,
          lesson_id: lessonId,
          file_name: reg.attachment.file_name,
          mime_type: reg.attachment.mime_type,
          size_bytes: reg.attachment.size_bytes,
          signed_url: null,
        },
      ],
    });
    addToast("Anhang hochgeladen", "success");
    router.refresh();
  }

  async function handleDeleteAttachment(lessonId: string, attachmentId: string) {
    if (!confirm("Anhang löschen?")) return;
    setAttachments({
      ...attachments,
      [lessonId]: (attachments[lessonId] ?? []).filter((a) => a.id !== attachmentId),
    });
    const res = await deleteLessonAttachment(attachmentId);
    if (res.error) addToast(res.error, "error");
    else addToast("Anhang gelöscht", "success");
  }

  const activeLesson = lessons.find((l) => l.id === activeLessonId) ?? null;
  const activeAttachments = activeLessonId ? attachments[activeLessonId] ?? [] : [];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
      {/* Sidebar: Modul/Lektion-Liste + Kurs-Meta */}
      <aside className="space-y-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
          <div className="space-y-3">
            <input
              defaultValue={course_.title}
              onBlur={(e) => e.target.value !== course_.title && saveCourseField("title", e.target.value)}
              className={inputCls + " font-semibold"}
            />
            <textarea
              defaultValue={course_.summary ?? ""}
              onBlur={(e) => saveCourseField("summary", e.target.value || null)}
              placeholder="Kurzbeschreibung"
              className={inputCls + " min-h-[60px]"}
            />
            <select
              defaultValue={course_.category_id ?? ""}
              onChange={(e) => saveCourseField("category_id", e.target.value || null)}
              className={inputCls}
            >
              <option value="">— Keine Kategorie —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={togglePublish}
                className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${
                  course_.status === "published"
                    ? "border border-green-200 bg-green-50 text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-300"
                    : "border border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-900/40 dark:bg-yellow-900/20 dark:text-yellow-300"
                }`}
              >
                {course_.status === "published" ? "Veröffentlicht" : "Entwurf"}
              </button>
              <Link
                href={`/learning/${course_.slug}`}
                target="_blank"
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50 dark:border-[#2c2c2e]/50 dark:text-gray-400 dark:hover:bg-white/5"
                title="Vorschau"
              >
                <Eye className="h-4 w-4" />
              </Link>
            </div>
            {saving && <p className="text-xs text-gray-400">Speichere {saving}…</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-3 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
          <div className="mb-2 flex items-center justify-between px-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Inhalt</h2>
            <button
              type="button"
              onClick={handleAddModule}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-primary dark:hover:bg-white/5"
              title="Modul hinzufügen"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3">
            {modules.length === 0 && (
              <p className="px-2 py-2 text-xs text-gray-400">Noch keine Module. Lege das erste an.</p>
            )}
            {modules.map((m) => {
              const ml = lessons.filter((l) => l.module_id === m.id).sort((a, b) => a.sort_order - b.sort_order);
              return (
                <div key={m.id}>
                  <div className="group flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-gray-50 dark:hover:bg-white/5">
                    <GripVertical className="h-3.5 w-3.5 text-gray-300" />
                    <button
                      onClick={() => handleRenameModule(m)}
                      className="flex-1 truncate text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400"
                    >
                      {m.title}
                    </button>
                    <button onClick={() => handleAddLesson(m.id)} className="text-gray-300 opacity-0 transition group-hover:opacity-100 hover:text-primary" title="Lektion">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleDeleteModule(m)} className="text-gray-300 opacity-0 transition group-hover:opacity-100 hover:text-red-500" title="Modul löschen">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <ul className="ml-3 mt-1 space-y-0.5">
                    {ml.map((l) => (
                      <li key={l.id}>
                        <button
                          onClick={() => setActiveLessonId(l.id)}
                          className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${
                            activeLessonId === l.id
                              ? "bg-primary/10 text-primary"
                              : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
                          }`}
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          <span className="line-clamp-1 flex-1">{l.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={handleDeleteCourse}
          className="w-full rounded-xl border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-900/20"
        >
          Kurs löschen
        </button>
      </aside>

      {/* Hauptbereich: aktive Lektion */}
      <main className="space-y-5">
        {!activeLesson ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center text-sm text-gray-400 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
            Wähle links eine Lektion aus oder lege eine neue an.
          </div>
        ) : (
          <LessonEditPanel
            key={activeLesson.id}
            lesson={activeLesson}
            attachments={activeAttachments}
            onLocalChange={(patch) => updateLessonLocal(activeLesson.id, patch)}
            onPersist={(patch) => pushLesson(activeLesson.id, patch)}
            onDelete={() => handleDeleteLesson(activeLesson.id)}
            onUpload={(file) => handleUploadAttachment(activeLesson.id, file)}
            onDeleteAttachment={(aid) => handleDeleteAttachment(activeLesson.id, aid)}
          />
        )}
      </main>
    </div>
  );
}

function LessonEditPanel({
  lesson,
  attachments,
  onLocalChange,
  onPersist,
  onDelete,
  onUpload,
  onDeleteAttachment,
}: {
  lesson: LearningLesson;
  attachments: LoadedLearningAttachment[];
  onLocalChange: (patch: Partial<LearningLesson>) => void;
  onPersist: (patch: Omit<Parameters<typeof updateLesson>[0], "id">) => void;
  onDelete: () => void;
  onUpload: (file: File) => void;
  onDeleteAttachment: (id: string) => void;
}) {
  const [contentHtml, setContentHtml] = useState(lesson.content_html ?? "");
  const inputCls =
    "block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e] dark:text-gray-100";

  const parsedVideo = parseVideoUrl(lesson.video_url);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <input
          defaultValue={lesson.title}
          onBlur={(e) => {
            if (e.target.value !== lesson.title) {
              onLocalChange({ title: e.target.value });
              onPersist({title: e.target.value });
            }
          }}
          className={inputCls + " text-xl font-semibold"}
        />
        <button onClick={onDelete} className="rounded-xl border border-red-200 p-2 text-red-600 transition hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-900/20" title="Lektion löschen">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <section className="space-y-2 rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Video (YouTube oder Loom)
        </label>
        <div className="flex items-center gap-2">
          <input
            defaultValue={lesson.video_url ?? ""}
            onBlur={(e) => {
              const v = e.target.value.trim() || null;
              if (v !== lesson.video_url) {
                onLocalChange({ video_url: v });
                onPersist({video_url: v });
              }
            }}
            placeholder="https://youtube.com/watch?v=… oder https://loom.com/share/…"
            className={inputCls}
          />
          {parsedVideo && (
            <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase text-primary">
              {parsedVideo.provider}
            </span>
          )}
        </div>
      </section>

      <section className="space-y-2 rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Inhalt
          </label>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <label className="flex items-center gap-1">
              Dauer:
              <input
                type="number"
                min={0}
                defaultValue={lesson.estimated_minutes ?? ""}
                onBlur={(e) => {
                  const v = e.target.value ? Number(e.target.value) : null;
                  onPersist({estimated_minutes: v });
                }}
                className="w-16 rounded-md border border-gray-200 px-2 py-0.5 text-xs dark:border-[#2c2c2e]/50 dark:bg-[#222224]"
              />
              Min.
            </label>
          </div>
        </div>
        <LessonEditor
          lessonId={lesson.id}
          initialHtml={lesson.content_html}
          onChange={(html) => {
            setContentHtml(html);
          }}
        />
        <div className="flex justify-end">
          <button
            onClick={() => onPersist({content_html: contentHtml })}
            className="rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-gray-900 shadow-sm transition hover:bg-primary-dark"
          >
            Inhalt speichern
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            <Paperclip className="h-3.5 w-3.5" /> Materialien
          </h3>
          <label className="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-[#2c2c2e]/50 dark:text-gray-300 dark:hover:bg-white/5">
            Datei hinzufügen
            <input
              type="file"
              accept={LEARNING_ATTACHMENT_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {attachments.length === 0 ? (
          <p className="text-xs text-gray-400">Noch keine Anhänge.</p>
        ) : (
          <ul className="space-y-1.5">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-[#222224]">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-800 dark:text-gray-200">{a.file_name}</span>
                  <span className="text-xs text-gray-400">{formatBytes(a.size_bytes)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {a.signed_url && (
                    <a href={a.signed_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <button onClick={() => onDeleteAttachment(a.id)} className="text-gray-300 hover:text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
