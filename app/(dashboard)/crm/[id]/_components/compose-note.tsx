"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { FileText, Paperclip, StickyNote, X } from "lucide-react";
import { addNote, createNoteAttachmentUploads } from "../../actions";
import { useToastContext } from "../../../toast-provider";
import {
  NOTE_ATTACHMENT_ACCEPT,
  NOTE_ATTACHMENT_ALLOWED_MIMES,
  NOTE_ATTACHMENT_MAX_BYTES,
  formatBytes,
  isImageMime,
  type UploadedAttachmentRef,
} from "@/lib/notes/format";
import { uploadFileToTicket } from "@/lib/notes/client-upload";

interface PendingAttachment {
  id: string;
  file: File;
  previewUrl: string | null;
}

export function ComposeNote({
  leadId, onClose, onSaved,
}: { leadId: string; onClose: () => void; onSaved: () => void }) {
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { addToast } = useToastContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  // ObjectURLs beim Unmount oder Wechsel revoken — sonst Memory-Leak.
  useEffect(() => {
    return () => {
      for (const a of attachments) if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    const accepted: PendingAttachment[] = [];
    for (const file of list) {
      if (!NOTE_ATTACHMENT_ALLOWED_MIMES.has(file.type)) {
        addToast(`Dateityp nicht erlaubt: ${file.name}`, "error");
        continue;
      }
      if (file.size > NOTE_ATTACHMENT_MAX_BYTES) {
        addToast(`${file.name} zu groß (max. ${NOTE_ATTACHMENT_MAX_BYTES / (1024 * 1024)} MB)`, "error");
        continue;
      }
      accepted.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: isImageMime(file.type) ? URL.createObjectURL(file) : null,
      });
    }
    if (accepted.length > 0) setAttachments((prev) => [...prev, ...accepted]);
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current += 1;
    if (e.dataTransfer?.types.includes("Files")) setIsDragging(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }

  function submit() {
    if (!content.trim() && attachments.length === 0) return;
    setError(null);
    startTransition(async () => {
      const refs: UploadedAttachmentRef[] = [];
      if (attachments.length > 0) {
        // 1) Upload-Tickets vom Server holen.
        const ticketRes = await createNoteAttachmentUploads(
          leadId,
          attachments.map((a) => ({
            clientId: a.id,
            fileName: a.file.name,
            mimeType: a.file.type,
            sizeBytes: a.file.size,
          })),
        );
        if ("error" in ticketRes) {
          setError(ticketRes.error);
          addToast(ticketRes.error, "error");
          return;
        }
        if (ticketRes.errors.length > 0) {
          for (const e of ticketRes.errors) addToast(e.error, "error");
        }
        // 2) Dateien direkt zu Supabase hochladen (umgeht Vercel-Function-Limit).
        for (const ticket of ticketRes.tickets) {
          const pending = attachments.find((a) => a.id === ticket.clientId);
          if (!pending) continue;
          const up = await uploadFileToTicket(ticket, pending.file);
          if ("error" in up) {
            addToast(`Upload ${pending.file.name}: ${up.error}`, "error");
            continue;
          }
          refs.push(up.ref);
        }
        if (refs.length === 0 && attachments.length > 0) {
          setError("Keine Datei konnte hochgeladen werden.");
          return;
        }
      }
      // 3) Notiz mit Anhang-Metadaten anlegen — Payload bleibt klein.
      const res = await addNote(leadId, content, refs);
      if (res.error) {
        setError(res.error);
        addToast(res.error, "error");
        return;
      }
      if (res.warning) addToast(res.warning, "error");
      else addToast("Notiz gespeichert", "success");
      for (const a of attachments) if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      setContent("");
      setAttachments([]);
      onSaved();
    });
  }

  const canSubmit = (content.trim().length > 0 || attachments.length > 0) && !pending;

  return (
    <div
      className={`relative border-b border-gray-100 p-4 transition-colors dark:border-[#2c2c2e] ${
        isDragging
          ? "bg-amber-100/50 dark:bg-amber-900/20"
          : "bg-amber-50/30 dark:bg-amber-900/5"
      }`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-amber-400 bg-amber-50/80 text-sm font-medium text-amber-800 dark:border-amber-500 dark:bg-amber-900/40 dark:text-amber-200">
          Datei hier ablegen, um sie anzuhängen
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          <StickyNote className="h-3.5 w-3.5" />
          Neue Notiz
        </p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onPaste={handlePaste}
        rows={3}
        autoFocus
        placeholder="Was ist passiert? Follow-Up? Beobachtung? (Cmd+V fuer Screenshots, Dateien per Drag &amp; Drop)"
        className="mt-2 w-full resize-none rounded-md border border-gray-200 bg-white p-2 text-sm dark:border-[#2c2c2e] dark:bg-[#161618]"
      />

      {attachments.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {attachments.map((a) => (
            <AttachmentChip key={a.id} attachment={a} onRemove={() => removeAttachment(a.id)} />
          ))}
        </ul>
      )}

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-300 dark:hover:bg-white/5"
          title="Datei anhängen"
        >
          <Paperclip className="h-3 w-3" />
          Datei anhängen
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"
          >
            Abbrechen
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-primary-dark disabled:opacity-50"
          >
            {pending ? "Speichern…" : "Notiz speichern"}
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={NOTE_ATTACHMENT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function AttachmentChip({
  attachment, onRemove,
}: { attachment: PendingAttachment; onRemove: () => void }) {
  const isImage = isImageMime(attachment.file.type);
  return (
    <li className="group relative">
      {isImage && attachment.previewUrl ? (
        <div className="relative h-16 w-16 overflow-hidden rounded-md border border-gray-200 dark:border-[#2c2c2e]">
          <Image
            src={attachment.previewUrl}
            alt={attachment.file.name}
            fill
            sizes="64px"
            className="object-cover"
            unoptimized
          />
        </div>
      ) : (
        <div className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-300">
          <FileText className="h-3.5 w-3.5 text-gray-400" />
          <span className="max-w-[180px] truncate" title={attachment.file.name}>
            {attachment.file.name}
          </span>
          <span className="text-gray-400">· {formatBytes(attachment.file.size)}</span>
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        title="Entfernen"
        className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-gray-700 text-white shadow-md group-hover:flex hover:bg-gray-900"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </li>
  );
}
