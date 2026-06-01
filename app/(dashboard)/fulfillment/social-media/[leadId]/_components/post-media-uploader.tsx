"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, X, Loader2 } from "lucide-react";
import {
  SOCIAL_ACCEPT,
  SOCIAL_ALLOWED_MIMES,
  formatBytes,
  maxBytesForMime,
} from "@/lib/social/format";
import { uploadMediaToTicket } from "@/lib/social/client-upload";
import type { LoadedPostMedia } from "@/lib/social/types";
import { createPostMediaUploads, attachPostMedia, removePostMedia, reorderMedia } from "../../actions";
import { useToastContext } from "../../../../toast-provider";
import { MediaThumb } from "./post-ui";

export function PostMediaUploader({
  postId,
  leadId,
  media,
  onChanged,
}: {
  postId: string;
  leadId: string;
  media: LoadedPostMedia[];
  onChanged: () => void;
}) {
  const { addToast } = useToastContext();
  const [order, setOrder] = useState<LoadedPostMedia[]>(media);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    setOrder(media);
  }, [media]);

  async function addFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    const valid: File[] = [];
    for (const file of files) {
      if (!SOCIAL_ALLOWED_MIMES.has(file.type)) {
        addToast(`Dateityp nicht erlaubt: ${file.name}`, "error");
        continue;
      }
      if (file.size > maxBytesForMime(file.type)) {
        addToast(`${file.name} zu groß (max. ${formatBytes(maxBytesForMime(file.type))})`, "error");
        continue;
      }
      valid.push(file);
    }
    if (valid.length === 0) return;

    setUploading(true);
    try {
      const ticketRes = await createPostMediaUploads(
        leadId,
        valid.map((f, i) => ({ clientId: String(i), fileName: f.name, mimeType: f.type, sizeBytes: f.size })),
      );
      if ("error" in ticketRes) {
        addToast(ticketRes.error, "error");
        return;
      }
      for (const e of ticketRes.errors) addToast(e.error, "error");

      const refs = [];
      for (const ticket of ticketRes.tickets) {
        const file = valid[Number(ticket.clientId)];
        if (!file) continue;
        const up = await uploadMediaToTicket(ticket, file);
        if ("error" in up) {
          addToast(`Upload ${file.name}: ${up.error}`, "error");
          continue;
        }
        refs.push(up.ref);
      }
      if (refs.length > 0) {
        const res = await attachPostMedia(postId, refs);
        if ("error" in res) addToast(res.error, "error");
        else onChanged();
      }
    } finally {
      setUploading(false);
    }
  }

  function remove(mediaId: string) {
    startTransition(async () => {
      const res = await removePostMedia(mediaId, leadId);
      if ("error" in res) addToast(res.error, "error");
      else onChanged();
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.findIndex((m) => m.id === active.id);
    const newIndex = order.findIndex((m) => m.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(order, oldIndex, newIndex);
    setOrder(next);
    startTransition(async () => {
      const res = await reorderMedia(postId, next.map((m) => m.id), leadId);
      if ("error" in res) {
        addToast(res.error, "error");
        setOrder(media);
      } else {
        onChanged();
      }
    });
  }

  return (
    <div
      // Native HTML5-Datei-Drop (getrennt vom @dnd-kit-Umsortieren, das Pointer-Events nutzt).
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.types).includes("Files")) {
          e.preventDefault();
          if (!dragOver) setDragOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={(e) => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files);
      }}
      className={
        dragOver
          ? "rounded-lg ring-2 ring-primary ring-offset-2 dark:ring-offset-[#161618]"
          : undefined
      }
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={order.map((m) => m.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {order.map((m) => (
              <SortableMedia key={m.id} media={m} onRemove={() => remove(m.id)} />
            ))}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-gray-200 text-gray-400 transition hover:border-primary hover:text-primary disabled:opacity-50 dark:border-[#2c2c2e]"
            >
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
            </button>
          </div>
        </SortableContext>
      </DndContext>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={SOCIAL_ACCEPT}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <p className="mt-1.5 text-[11px] text-gray-400">
        Dateien per Drag &amp; Drop oder Klick hinzufügen · Bilder bis 25 MB, Videos bis 200 MB · Reihenfolge der Kacheln ziehen (Carousel).
      </p>
    </div>
  );
}

function SortableMedia({ media, onRemove }: { media: LoadedPostMedia; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: media.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group relative aspect-square cursor-grab touch-none overflow-hidden rounded-lg border border-gray-200 active:cursor-grabbing dark:border-[#2c2c2e]"
    >
      <MediaThumb media={media} className="h-full w-full" />
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onRemove}
        title="Entfernen"
        className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-gray-900/80 text-white group-hover:flex hover:bg-gray-900"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
