"use client";

import { useEffect, useState, useTransition } from "react";
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  MoreHorizontal,
  Plus,
  Trash2,
  Copy,
  Pencil,
} from "lucide-react";
import { useDialog } from "@/components/dialog";
import { useToastContext } from "../../toast-provider";
import type { LearningLesson, LearningModule } from "@/lib/types";
import { LessonTypeIcon } from "./lesson-type-icon";
import {
  createLesson,
  createModule,
  deleteLesson,
  deleteModule,
  duplicateLesson,
  duplicateModule,
  reorderItems,
  reorderLessonsAcrossModules,
  updateLesson,
  updateModule,
} from "../_actions/courses";

interface Props {
  courseId: string;
  modules: LearningModule[];
  lessons: LearningLesson[];
  activeLessonId: string | null;
  onSelectLesson: (id: string) => void;
  onSelectCourse: () => void;
  onChange: (next: { modules: LearningModule[]; lessons: LearningLesson[] }) => void;
}

export function CurriculumTree({
  courseId,
  modules,
  lessons,
  activeLessonId,
  onSelectLesson,
  onSelectCourse,
  onChange,
}: Props) {
  const dialog = useDialog();
  const { addToast } = useToastContext();
  const [, start] = useTransition();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [addingLessonIn, setAddingLessonIn] = useState<string | null>(null);
  const [addingModule, setAddingModule] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function toggleCollapse(moduleId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  }

  // ↑/↓ Tastatur-Navigation durch alle sichtbaren Lessons (Modul-Reihenfolge, sort_order).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (t.isContentEditable) return;
      }
      const ordered: string[] = [];
      const sortedMods = [...modules].sort((a, b) => a.sort_order - b.sort_order);
      for (const m of sortedMods) {
        if (collapsed.has(m.id)) continue;
        const mLessons = lessons
          .filter((l) => l.module_id === m.id)
          .sort((a, b) => a.sort_order - b.sort_order);
        for (const l of mLessons) ordered.push(l.id);
      }
      if (ordered.length === 0) return;
      e.preventDefault();
      const idx = activeLessonId ? ordered.indexOf(activeLessonId) : -1;
      const dir = e.key === "ArrowDown" ? 1 : -1;
      const nextIdx = idx === -1
        ? (dir === 1 ? 0 : ordered.length - 1)
        : Math.min(ordered.length - 1, Math.max(0, idx + dir));
      const nextId = ordered[nextIdx];
      if (nextId && nextId !== activeLessonId) onSelectLesson(nextId);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modules, lessons, collapsed, activeLessonId, onSelectLesson]);

  // ─── Module-Aktionen ──────────────────────────────────────────────
  async function handleAddModule(title: string) {
    if (!title.trim()) return;
    const res = await createModule({ course_id: courseId, title });
    if ("error" in res) return addToast(res.error, "error");
    onChange({ modules: [...modules, res.module], lessons });
    addToast("Modul angelegt", "success");
  }

  async function handleRenameModule(m: LearningModule, nextTitle: string) {
    const trimmed = nextTitle.trim();
    if (!trimmed || trimmed === m.title) return;
    const optimistic = modules.map((x) => (x.id === m.id ? { ...x, title: trimmed } : x));
    onChange({ modules: optimistic, lessons });
    const res = await updateModule({ id: m.id, title: trimmed });
    if (res.error) addToast(res.error, "error");
  }

  async function handleDuplicateModule(m: LearningModule) {
    const res = await duplicateModule(m.id);
    if ("error" in res) return addToast(res.error, "error");
    addToast("Modul dupliziert", "success");
    // Server-state ist authoritativ — wir reloaden via parent.
    location.reload();
  }

  async function handleDeleteModule(m: LearningModule) {
    const ok = await dialog.confirm({
      title: `Modul "${m.title}" löschen?`,
      body: "Inklusive aller Lektionen darin. Diese Aktion kann nicht rückgängig gemacht werden.",
      danger: true,
      confirmLabel: "Löschen",
    });
    if (!ok) return;
    const optimisticMods = modules.filter((x) => x.id !== m.id);
    const optimisticLessons = lessons.filter((l) => l.module_id !== m.id);
    onChange({ modules: optimisticMods, lessons: optimisticLessons });
    const res = await deleteModule(m.id);
    if (res.error) addToast(res.error, "error");
  }

  // ─── Lesson-Aktionen ──────────────────────────────────────────────
  async function handleAddLesson(moduleId: string, title: string) {
    if (!title.trim()) return;
    const res = await createLesson({ module_id: moduleId, title });
    if ("error" in res) return addToast(res.error, "error");
    onChange({ modules, lessons: [...lessons, res.lesson] });
    onSelectLesson(res.lesson.id);
    setAddingLessonIn(null);
  }

  async function handleDuplicateLesson(l: LearningLesson) {
    const res = await duplicateLesson(l.id);
    if ("error" in res) return addToast(res.error, "error");
    onChange({ modules, lessons: [...lessons, res.lesson] });
    addToast("Lektion dupliziert", "success");
  }

  async function handleDeleteLesson(l: LearningLesson) {
    const ok = await dialog.confirm({
      title: `Lektion "${l.title}" löschen?`,
      danger: true,
      confirmLabel: "Löschen",
    });
    if (!ok) return;
    const optimistic = lessons.filter((x) => x.id !== l.id);
    onChange({ modules, lessons: optimistic });
    const res = await deleteLesson(l.id);
    if (res.error) addToast(res.error, "error");
  }

  // ─── Drag&Drop ────────────────────────────────────────────────────
  function onDragStart(e: DragStartEvent) {
    setDraggedId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setDraggedId(null);
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    // Modul-Reorder
    if (activeId.startsWith("module:") && overId.startsWith("module:")) {
      const fromId = activeId.slice("module:".length);
      const toId = overId.slice("module:".length);
      const oldIndex = modules.findIndex((m) => m.id === fromId);
      const newIndex = modules.findIndex((m) => m.id === toId);
      if (oldIndex === -1 || newIndex === -1) return;
      const next = arrayMove(modules, oldIndex, newIndex);
      onChange({ modules: next, lessons });
      start(async () => {
        await reorderItems({ kind: "module", ids: next.map((m) => m.id) });
      });
      return;
    }

    // Lesson-Reorder (innerhalb + zwischen Modulen)
    if (activeId.startsWith("lesson:")) {
      const fromLessonId = activeId.slice("lesson:".length);
      const fromLesson = lessons.find((l) => l.id === fromLessonId);
      if (!fromLesson) return;

      let targetModuleId: string;
      let targetIndex: number;

      if (overId.startsWith("lesson:")) {
        const toLessonId = overId.slice("lesson:".length);
        const toLesson = lessons.find((l) => l.id === toLessonId);
        if (!toLesson) return;
        targetModuleId = toLesson.module_id;
        const moduleLessons = lessons
          .filter((l) => l.module_id === targetModuleId)
          .sort((a, b) => a.sort_order - b.sort_order);
        targetIndex = moduleLessons.findIndex((l) => l.id === toLessonId);
      } else if (overId.startsWith("module-dropzone:")) {
        targetModuleId = overId.slice("module-dropzone:".length);
        const moduleLessons = lessons
          .filter((l) => l.module_id === targetModuleId)
          .sort((a, b) => a.sort_order - b.sort_order);
        targetIndex = moduleLessons.length;
      } else {
        return;
      }

      // Optimistic update
      const others = lessons.filter((l) => l.id !== fromLessonId);
      const targetLessons = others
        .filter((l) => l.module_id === targetModuleId)
        .sort((a, b) => a.sort_order - b.sort_order);
      const updatedTargetLessons = [
        ...targetLessons.slice(0, targetIndex),
        { ...fromLesson, module_id: targetModuleId },
        ...targetLessons.slice(targetIndex),
      ].map((l, i) => ({ ...l, sort_order: i }));
      const sourceModuleId = fromLesson.module_id;
      const sourceLessons =
        sourceModuleId === targetModuleId
          ? []
          : others
              .filter((l) => l.module_id === sourceModuleId)
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((l, i) => ({ ...l, sort_order: i }));
      const otherLessons = others.filter(
        (l) => l.module_id !== targetModuleId && l.module_id !== sourceModuleId,
      );
      const nextLessons = [...otherLessons, ...sourceLessons, ...updatedTargetLessons];
      onChange({ modules, lessons: nextLessons });

      // Persist
      const groups = Array.from(new Set([sourceModuleId, targetModuleId])).map((mid) => ({
        moduleId: mid,
        lessonIds: nextLessons
          .filter((l) => l.module_id === mid)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((l) => l.id),
      }));
      start(async () => {
        const res = await reorderLessonsAcrossModules({ groups });
        if (res.error) addToast(res.error, "error");
      });
    }
  }

  const sortedModules = [...modules].sort((a, b) => a.sort_order - b.sort_order);
  const moduleIds = sortedModules.map((m) => `module:${m.id}`);

  return (
    <div className="flex h-full flex-col">
      <button
        type="button"
        onClick={onSelectCourse}
        className="mx-3 mb-3 rounded-lg px-2 py-1 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 hover:bg-gray-100 hover:text-primary dark:text-gray-400 dark:hover:bg-white/5"
      >
        Kurs-Einstellungen
      </button>

      <div className="flex-1 overflow-y-auto px-2">
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <SortableContext items={moduleIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {sortedModules.map((m) => {
                const moduleLessons = lessons
                  .filter((l) => l.module_id === m.id)
                  .sort((a, b) => a.sort_order - b.sort_order);
                const isCollapsed = collapsed.has(m.id);
                return (
                  <ModuleRow
                    key={m.id}
                    module={m}
                    lessons={moduleLessons}
                    collapsed={isCollapsed}
                    activeLessonId={activeLessonId}
                    dragging={draggedId !== null}
                    onToggle={() => toggleCollapse(m.id)}
                    onSelectLesson={onSelectLesson}
                    onRenameInline={(title) => handleRenameModule(m, title)}
                    onDuplicate={() => handleDuplicateModule(m)}
                    onDelete={() => handleDeleteModule(m)}
                    onAddLessonClick={() => setAddingLessonIn(m.id)}
                    addingLesson={addingLessonIn === m.id}
                    onAddLessonCancel={() => setAddingLessonIn(null)}
                    onAddLesson={(title) => handleAddLesson(m.id, title)}
                    onDeleteLesson={handleDeleteLesson}
                    onDuplicateLesson={handleDuplicateLesson}
                  />
                );
              })}
            </div>
          </SortableContext>

          <DragOverlay>
            {draggedId?.startsWith("module:") ? (
              <div className="rounded-lg border border-primary/40 bg-white px-3 py-2 text-sm font-semibold shadow-lg dark:bg-[#1c1c1e]">
                {modules.find((m) => `module:${m.id}` === draggedId)?.title ?? ""}
              </div>
            ) : draggedId?.startsWith("lesson:") ? (
              <div className="rounded-lg border border-primary/40 bg-white px-3 py-2 text-xs shadow-lg dark:bg-[#1c1c1e]">
                {lessons.find((l) => `lesson:${l.id}` === draggedId)?.title ?? ""}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {sortedModules.length === 0 && !addingModule && (
          <div className="mt-4 rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400 dark:border-[#2c2c2e]/50">
            Noch keine Module
          </div>
        )}

        {addingModule ? (
          <InlineAddInput
            placeholder="Modul-Titel…"
            onCancel={() => setAddingModule(false)}
            onSubmit={(v) => {
              handleAddModule(v);
              setAddingModule(false);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAddingModule(true)}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-200 px-3 py-2 text-xs font-medium text-gray-500 transition hover:border-primary hover:bg-primary/5 hover:text-primary dark:border-[#2c2c2e]/50 dark:text-gray-400"
          >
            <Plus className="h-3.5 w-3.5" /> Modul hinzufügen
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Modul-Zeile (sortable) ──────────────────────────────────────

function ModuleRow({
  module: m,
  lessons,
  collapsed,
  activeLessonId,
  dragging,
  onToggle,
  onSelectLesson,
  onRenameInline,
  onDuplicate,
  onDelete,
  onAddLessonClick,
  addingLesson,
  onAddLessonCancel,
  onAddLesson,
  onDeleteLesson,
  onDuplicateLesson,
}: {
  module: LearningModule;
  lessons: LearningLesson[];
  collapsed: boolean;
  activeLessonId: string | null;
  dragging: boolean;
  onToggle: () => void;
  onSelectLesson: (id: string) => void;
  onRenameInline: (title: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAddLessonClick: () => void;
  addingLesson: boolean;
  onAddLessonCancel: () => void;
  onAddLesson: (title: string) => void;
  onDeleteLesson: (l: LearningLesson) => void;
  onDuplicateLesson: (l: LearningLesson) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `module:${m.id}`,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const lessonIds = lessons.map((l) => `lesson:${l.id}`);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(m.title);

  function commitRename() {
    setEditing(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== m.title) onRenameInline(trimmed);
    else setTitleDraft(m.title);
  }

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "opacity-30" : ""}>
      <div className="group flex items-center gap-1 rounded-lg px-1 py-1 hover:bg-gray-50 dark:hover:bg-white/5">
        <button {...attributes} {...listeners} className="cursor-grab text-gray-400 opacity-40 transition group-hover:opacity-100 active:cursor-grabbing">
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <button onClick={onToggle} className="text-gray-400" aria-label={collapsed ? "Aufklappen" : "Zuklappen"}>
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {editing ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename();
              } else if (e.key === "Escape") {
                setTitleDraft(m.title);
                setEditing(false);
              }
            }}
            className="flex-1 rounded-md border border-primary/40 bg-white px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary dark:bg-[#1c1c1e] dark:text-gray-200"
          />
        ) : (
          <button
            onDoubleClick={() => {
              setTitleDraft(m.title);
              setEditing(true);
            }}
            className="flex-1 truncate text-left text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300"
            title="Doppelklick zum Umbenennen"
          >
            {m.title}
          </button>
        )}
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setTitleDraft(m.title);
              setEditing(true);
            }}
            className="rounded p-0.5 text-gray-400 opacity-50 transition hover:bg-gray-100 hover:text-primary group-hover:opacity-100 dark:hover:bg-white/5"
            aria-label="Modul umbenennen"
            title="Umbenennen"
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
        <ContextMenu
          items={[
            { label: "Umbenennen", icon: Pencil, onClick: () => { setTitleDraft(m.title); setEditing(true); } },
            { label: "Duplizieren", icon: Copy, onClick: onDuplicate },
            { label: "Löschen", icon: Trash2, onClick: onDelete, danger: true },
          ]}
        />
      </div>

      {!collapsed && (
        <SortableContext items={lessonIds} strategy={verticalListSortingStrategy}>
          <div className="ml-3 mt-0.5 space-y-0.5">
            <ModuleDropzone moduleId={m.id} empty={lessons.length === 0} dragging={dragging} />
            {lessons.map((l) => (
              <LessonRow
                key={l.id}
                lesson={l}
                active={activeLessonId === l.id}
                onSelect={() => onSelectLesson(l.id)}
                onDelete={() => onDeleteLesson(l)}
                onDuplicate={() => onDuplicateLesson(l)}
              />
            ))}

            {addingLesson ? (
              <AddLessonInline onCancel={onAddLessonCancel} onSubmit={onAddLesson} />
            ) : (
              <button
                type="button"
                onClick={onAddLessonClick}
                className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-gray-400 transition hover:bg-gray-50 hover:text-primary dark:hover:bg-white/5"
              >
                <Plus className="h-3 w-3" /> Lektion hinzufügen
              </button>
            )}
          </div>
        </SortableContext>
      )}
    </div>
  );
}

function ModuleDropzone({ moduleId, empty, dragging }: { moduleId: string; empty: boolean; dragging: boolean }) {
  // Eigener droppable Marker als „leeres Modul aufnehmen". Bei Lesson-Liste werden
  // sonst die Lesson-Items selbst die Drop-Targets — fuer ein leeres Modul brauchen
  // wir aber etwas.
  const { setNodeRef, isOver } = useSortable({ id: `module-dropzone:${moduleId}` });
  if (!empty) {
    return <div ref={setNodeRef} className={isOver ? "h-1 rounded-full bg-primary/40" : "h-0"} />;
  }
  // Leeres Modul: idle nur dezente Andeutung, prominenter Indikator erst beim
  // aktiven Drag.
  if (!dragging) {
    return <div ref={setNodeRef} className="px-2 py-0.5 text-[10px] italic text-gray-300 dark:text-gray-600">leer</div>;
  }
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border border-dashed px-3 py-2 text-center text-xs transition ${
        isOver
          ? "border-primary bg-primary/5 text-primary"
          : "border-gray-200 text-gray-400 dark:border-[#2c2c2e]/50"
      }`}
    >
      Lektion hierher ziehen
    </div>
  );
}

// ─── Lesson-Zeile (sortable) ──────────────────────────────────────

function LessonRow({
  lesson,
  active,
  onSelect,
  onDelete,
  onDuplicate,
}: {
  lesson: LearningLesson;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `lesson:${lesson.id}`,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-1 rounded-lg pr-1 ${isDragging ? "opacity-30" : ""} ${
        active ? "bg-primary/10" : "hover:bg-gray-50 dark:hover:bg-white/5"
      }`}
    >
      <button {...attributes} {...listeners} className="cursor-grab pl-1 text-gray-400 opacity-30 transition group-hover:opacity-100 active:cursor-grabbing">
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onSelect}
        className={`flex flex-1 items-center gap-1.5 py-1.5 text-left text-xs ${
          active ? "text-primary" : "text-gray-700 dark:text-gray-300"
        }`}
      >
        <LessonTypeIcon type={lesson.lesson_type} className={`h-3.5 w-3.5 shrink-0 ${active ? "text-primary" : "text-gray-400"}`} />
        <span className="line-clamp-1 flex-1">{lesson.title}</span>
      </button>
      <ContextMenu
        items={[
          { label: "Duplizieren", icon: Copy, onClick: onDuplicate },
          { label: "Löschen", icon: Trash2, onClick: onDelete, danger: true },
        ]}
      />
    </div>
  );
}

// ─── Inline Add ───────────────────────────────────────────────────

function InlineAddInput({
  placeholder,
  onCancel,
  onSubmit,
}: {
  placeholder: string;
  onCancel: () => void;
  onSubmit: (v: string) => void;
}) {
  const [v, setV] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) onSubmit(v.trim());
      }}
      className="mt-2"
    >
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          if (!v.trim()) onCancel();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        placeholder={placeholder}
        className="w-full rounded-lg border border-primary/50 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary dark:bg-[#1c1c1e]"
      />
    </form>
  );
}

function AddLessonInline({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (title: string) => void;
}) {
  const [title, setTitle] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) onSubmit(title.trim());
      }}
      className="my-1"
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          if (!title.trim()) onCancel();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Lektions-Titel — Enter zum Anlegen"
        className="w-full rounded-lg border border-primary/50 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary dark:bg-[#1c1c1e]"
      />
    </form>
  );
}

// ─── Context-Menu (Dropdown) ──────────────────────────────────────

interface MenuItem {
  label: string;
  icon: typeof Trash2;
  onClick: () => void;
  danger?: boolean;
}

function ContextMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="rounded p-1 text-gray-300 opacity-0 transition group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 min-w-[160px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition ${
                  it.danger
                    ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                    : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
                }`}
              >
                <it.icon className="h-3.5 w-3.5" />
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
