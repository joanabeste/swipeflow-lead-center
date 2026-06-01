"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MessageSquare, CalendarClock } from "lucide-react";
import { BOARD_STATUSES, POST_STATUS_LABELS, type PostStatus } from "@/lib/social/format";
import type { PostWithMedia } from "@/lib/social/types";
import { useToastContext } from "../../../../toast-provider";
import { updatePostStatus } from "../../actions";
import { FormatBadge, MediaThumb, PlatformIcons, formatScheduled } from "./post-ui";

export function BoardView({ posts, onEdit }: { posts: PostWithMedia[]; onEdit: (p: PostWithMedia) => void }) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [overrides, setOverrides] = useState<Record<string, PostStatus>>({});

  const effectiveStatus = (p: PostWithMedia) => overrides[p.id] ?? p.status;
  const byStatus = new Map<PostStatus, PostWithMedia[]>();
  for (const s of BOARD_STATUSES) byStatus.set(s, []);
  for (const p of posts) {
    const arr = byStatus.get(effectiveStatus(p));
    if (arr) arr.push(p);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const postId = String(active.id);
    const newStatus = String(over.id) as PostStatus;
    const post = posts.find((p) => p.id === postId);
    if (!post || effectiveStatus(post) === newStatus) return;

    setOverrides((m) => ({ ...m, [postId]: newStatus }));
    startTransition(async () => {
      const res = await updatePostStatus(postId, newStatus);
      if ("error" in res) {
        addToast(res.error, "error");
        setOverrides((m) => {
          const next = { ...m };
          delete next[postId];
          return next;
        });
      } else {
        router.refresh();
      }
    });
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="grid auto-cols-[280px] grid-flow-col gap-3 overflow-x-auto pb-2">
        {BOARD_STATUSES.map((status) => (
          <StatusColumn key={status} status={status} posts={byStatus.get(status) ?? []} onEdit={onEdit} />
        ))}
      </div>
    </DndContext>
  );
}

function StatusColumn({
  status,
  posts,
  onEdit,
}: {
  status: PostStatus;
  posts: PostWithMedia[];
  onEdit: (p: PostWithMedia) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-xl border bg-gray-50/50 p-2 transition dark:bg-white/[0.02] ${
        isOver ? "border-primary bg-primary/5" : "border-gray-200 dark:border-[#2c2c2e]"
      }`}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{POST_STATUS_LABELS[status]}</p>
        <span className="text-xs text-gray-400">{posts.length}</span>
      </div>
      <div className="flex-1 space-y-1.5">
        {posts.length === 0 && (
          <p className="rounded-md border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400 dark:border-[#2c2c2e]">
            Hierher ziehen
          </p>
        )}
        {posts.map((p) => (
          <BoardCard key={p.id} post={p} onEdit={onEdit} />
        ))}
      </div>
    </div>
  );
}

function BoardCard({ post, onEdit }: { post: PostWithMedia; onEdit: (p: PostWithMedia) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: post.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };
  const preview = post.title?.trim() || post.caption.trim() || "Ohne Titel";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-gray-200 bg-white p-2 text-sm shadow-sm hover:border-primary dark:border-[#2c2c2e] dark:bg-[#1c1c1e]"
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          title="Verschieben"
          className="mt-0.5 cursor-grab touch-none text-gray-300 hover:text-gray-500 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => onEdit(post)} className="min-w-0 flex-1 text-left">
          <div className="flex gap-2">
            <MediaThumb media={post.media[0]} className="h-12 w-12 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-gray-900 dark:text-gray-100" title={preview}>
                {preview}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <FormatBadge format={post.format} />
                <PlatformIcons platforms={post.platforms} />
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3 w-3" /> {formatScheduled(post.scheduled_at)}
            </span>
            {post.comment_count > 0 && (
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="h-3 w-3" /> {post.comment_count}
              </span>
            )}
          </div>
        </button>
      </div>
    </div>
  );
}
