"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Paperclip,
  Trash2,
  ExternalLink,
  Video,
  FileText,
  Upload,
  GripVertical,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDialog } from "@/components/dialog";
import { useToastContext } from "../../toast-provider";
import type { LearningLesson, LoadedLearningAttachment } from "@/lib/types";
import { updateLesson } from "../_actions/courses";
import {
  createLessonUploadTickets,
  registerLessonUpload,
  deleteLessonAttachment,
  reorderLessonAttachments,
  renameLessonAttachment,
} from "../_actions/attachments";
import { uploadFileToLearningTicket } from "../_lib/client-upload";
import { LEARNING_ATTACHMENT_ACCEPT, formatBytes, parseVideoUrl } from "../_lib/format";
import { LessonEditor } from "./lesson-editor";
import { VideoEmbed } from "./video-embed";
import { useAutosave } from "../_hooks/use-autosave";

interface Props {
  lesson: LearningLesson;
  attachments: LoadedLearningAttachment[];
  onLessonChange: (next: LearningLesson) => void;
  onAttachmentsChange: (next: LoadedLearningAttachment[]) => void;
  onSaveStateChange: (state: ReturnType<typeof useAutosave>) => void;
}

export function LessonEditorPanel({
  lesson,
  attachments,
  onLessonChange,
  onAttachmentsChange,
  onSaveStateChange,
}: Props) {
  const dialog = useDialog();
  const { addToast } = useToastContext();
  const router = useRouter();
  const autosave = useAutosave(800);

  // Save-State an Parent durchreichen (z.B. fuer Top-Bar-Indicator)
  useEffect(() => {
    onSaveStateChange(autosave);
  }, [autosave.state, autosave.lastSavedAt, autosave.error]); // eslint-disable-line react-hooks/exhaustive-deps

  function patch(next: Partial<LearningLesson>, persistDelay = 800) {
    const merged = { ...lesson, ...next };
    onLessonChange(merged);
    autosave.schedule(async () => {
      return updateLesson({ id: lesson.id, ...next });
    });
    if (persistDelay === 0) {
      void autosave.flush();
    }
  }

  // ─── Anhaenge-Upload ───────────────────────────────────────────
  async function handleUpload(file: File) {
    const clientId = crypto.randomUUID();
    const ticketRes = await createLessonUploadTickets({
      lessonId: lesson.id,
      files: [{ clientId, fileName: file.name, mimeType: file.type, sizeBytes: file.size }],
    });
    if ("error" in ticketRes) return addToast(ticketRes.error, "error");
    if (ticketRes.errors.length > 0) return addToast(ticketRes.errors[0].error, "error");
    const up = await uploadFileToLearningTicket(ticketRes.tickets[0], file);
    if ("error" in up) return addToast(up.error, "error");
    const reg = await registerLessonUpload({ lessonId: lesson.id, ref: up.ref });
    if ("error" in reg) return addToast(reg.error, "error");
    onAttachmentsChange([
      ...attachments,
      {
        id: reg.attachment.id,
        lesson_id: lesson.id,
        file_name: reg.attachment.file_name,
        mime_type: reg.attachment.mime_type,
        size_bytes: reg.attachment.size_bytes,
        sort_order: reg.attachment.sort_order,
        signed_url: null,
      },
    ]);
    addToast("Datei hochgeladen", "success");
    router.refresh();
  }

  async function handleDeleteAttachment(aid: string) {
    const ok = await dialog.confirm({
      title: "Anhang löschen?",
      danger: true,
      confirmLabel: "Löschen",
    });
    if (!ok) return;
    onAttachmentsChange(attachments.filter((a) => a.id !== aid));
    const res = await deleteLessonAttachment(aid);
    if (res.error) addToast(res.error, "error");
  }

  async function handleRenameAttachment(a: LoadedLearningAttachment) {
    const next = await dialog.prompt({
      title: "Datei-Name ändern",
      defaultValue: a.file_name,
      placeholder: "Datei-Name",
    });
    if (next === null || next.trim() === a.file_name) return;
    onAttachmentsChange(attachments.map((x) => (x.id === a.id ? { ...x, file_name: next.trim() } : x)));
    const res = await renameLessonAttachment({ attachmentId: a.id, fileName: next.trim() });
    if (res.error) addToast(res.error, "error");
  }

  // Drag-Reorder Attachments
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  function onAttachmentDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = attachments.findIndex((a) => a.id === active.id);
    const newIdx = attachments.findIndex((a) => a.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const next = arrayMove(attachments, oldIdx, newIdx);
    onAttachmentsChange(next);
    void reorderLessonAttachments({
      lessonId: lesson.id,
      attachmentIds: next.map((a) => a.id),
    });
  }

  const showVideo = lesson.lesson_type === "video" || lesson.lesson_type === "mixed";
  const showText = lesson.lesson_type === "text" || lesson.lesson_type === "mixed" || lesson.lesson_type === "video";
  const showFiles = true; // immer sichtbar — auch text/video-Lessons koennen Begleitmaterial haben

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-4">
      {/* Notion-Style H1-Title */}
      <input
        defaultValue={lesson.title}
        key={lesson.id + ":title"}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v && v !== lesson.title) patch({ title: v });
        }}
        placeholder="Lektions-Titel…"
        className="w-full border-0 bg-transparent text-3xl font-bold text-gray-900 placeholder-gray-300 focus:outline-none dark:text-gray-100"
      />

      {/* Kurzbeschreibung */}
      <input
        defaultValue={lesson.summary ?? ""}
        key={lesson.id + ":summary"}
        onBlur={(e) => {
          const v = e.target.value;
          if (v !== (lesson.summary ?? "")) patch({ summary: v || null });
        }}
        placeholder="Kurzbeschreibung (optional, erscheint in der Übersicht)"
        className="w-full border-0 bg-transparent text-sm text-gray-500 placeholder-gray-300 focus:outline-none dark:text-gray-400"
      />

      {/* Video-Sektion */}
      {showVideo && (
        <section className="space-y-2">
          <SectionHeader icon={Video} title={lesson.lesson_type === "video" ? "Video" : "Video (optional)"} />
          <VideoUrlInput
            key={lesson.id + ":video"}
            initialUrl={lesson.video_url}
            onChange={(v) => patch({ video_url: v })}
          />
          {lesson.video_url && <VideoEmbed url={lesson.video_url} />}
        </section>
      )}

      {/* Text/Content-Sektion */}
      {showText && (
        <section className="space-y-2">
          <SectionHeader
            icon={FileText}
            title={lesson.lesson_type === "text" ? "Inhalt" : "Begleittext (optional)"}
          />
          <LessonEditor
            key={lesson.id + ":content"}
            lessonId={lesson.id}
            initialHtml={lesson.content_html}
            onChange={(html) => patch({ content_html: html })}
          />
        </section>
      )}

      {/* Materialien */}
      {showFiles && (
        <section className="space-y-2">
          <SectionHeader
            icon={Paperclip}
            title={lesson.lesson_type === "file" ? "Dateien" : "Materialien (optional)"}
            right={
              <label className="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-[#2c2c2e]/50 dark:text-gray-300 dark:hover:bg-white/5">
                <Upload className="mr-1 inline h-3.5 w-3.5" /> Datei hinzufügen
                <input
                  type="file"
                  accept={LEARNING_ATTACHMENT_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                    e.target.value = "";
                  }}
                />
              </label>
            }
          />
          {attachments.length === 0 ? (
            <FileDropZone onFile={handleUpload} />
          ) : (
            <DndContext sensors={sensors} onDragEnd={onAttachmentDragEnd}>
              <SortableContext items={attachments.map((a) => a.id)} strategy={verticalListSortingStrategy}>
                <ul className="space-y-1.5">
                  {attachments.map((a) => (
                    <AttachmentRow
                      key={a.id}
                      attachment={a}
                      onRename={() => handleRenameAttachment(a)}
                      onDelete={() => handleDeleteAttachment(a.id)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </section>
      )}
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  right,
}: {
  icon: typeof FileText;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        <Icon className="h-3.5 w-3.5" /> {title}
      </h3>
      {right}
    </div>
  );
}

function VideoUrlInput({ initialUrl, onChange }: { initialUrl: string | null; onChange: (v: string | null) => void }) {
  const [v, setV] = useState(initialUrl ?? "");
  const parsed = parseVideoUrl(v);
  return (
    <div className="flex items-center gap-2">
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const trimmed = v.trim() || null;
          if (trimmed !== initialUrl) onChange(trimmed);
        }}
        placeholder="https://youtube.com/watch?v=… oder https://loom.com/share/…"
        className="block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e] dark:text-gray-100"
      />
      {parsed && (
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase text-primary">
          {parsed.provider}
        </span>
      )}
    </div>
  );
}

function FileDropZone({ onFile }: { onFile: (f: File) => void }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      onClick={() => inputRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed py-10 text-sm transition ${
        dragOver
          ? "border-primary bg-primary/5 text-primary"
          : "border-gray-200 text-gray-400 hover:border-primary/40 hover:bg-gray-50 dark:border-[#2c2c2e]/50 dark:hover:bg-white/5"
      }`}
    >
      <Upload className="h-6 w-6" />
      <p>Datei hier ablegen oder klicken zum Hochladen</p>
      <p className="text-xs text-gray-300">PDF, Bilder, Office-Dokumente, Videos · max. 25 MB</p>
      <input
        ref={inputRef}
        type="file"
        accept={LEARNING_ATTACHMENT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function AttachmentRow({
  attachment: a,
  onRename,
  onDelete,
}: {
  attachment: LoadedLearningAttachment;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: a.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const isImage = a.mime_type.startsWith("image/");
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`group flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 dark:bg-[#222224] ${
        isDragging ? "opacity-30" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <button {...attributes} {...listeners} className="cursor-grab text-gray-300 active:cursor-grabbing">
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        {isImage && a.signed_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.signed_url} alt="" className="h-9 w-9 rounded object-cover" />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded bg-primary/10 text-[10px] font-semibold uppercase text-primary">
            {a.file_name.split(".").pop()?.slice(0, 4) || "FILE"}
          </span>
        )}
        <div>
          <button onClick={onRename} className="text-sm text-gray-800 hover:text-primary dark:text-gray-200">
            {a.file_name}
          </button>
          <p className="text-xs text-gray-400">{formatBytes(a.size_bytes)}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {a.signed_url && (
          <a href={a.signed_url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-primary">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        <button onClick={onDelete} className="text-gray-300 hover:text-red-500">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}
