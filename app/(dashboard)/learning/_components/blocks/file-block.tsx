"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Upload, Paperclip, Download } from "lucide-react";
import { useToastContext } from "../../../toast-provider";
import { createLessonUploadTickets, registerLessonUpload } from "../../_actions/attachments";
import { uploadFileToLearningTicket } from "../../_lib/client-upload";
import { LEARNING_ATTACHMENT_BUCKET, LEARNING_ATTACHMENT_ACCEPT, formatBytes } from "../../_lib/format";
import type { LearningBlock } from "@/lib/types";

type FileBlockData = Extract<LearningBlock, { type: "file" }>;

interface Props {
  lessonId: string;
  block: FileBlockData;
  onChange: (patch: Partial<Omit<FileBlockData, "id" | "type">>) => void;
}

export function FileBlock({ lessonId, block, onChange }: Props) {
  const { addToast } = useToastContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!block.storagePath) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSignedUrl(null);
      return;
    }
    void (async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const sb = createClient();
      const { data } = await sb.storage
        .from(LEARNING_ATTACHMENT_BUCKET)
        .createSignedUrl(block.storagePath, 60 * 60 * 24 * 7);
      if (!cancelled) setSignedUrl(data?.signedUrl ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [block.storagePath]);

  async function handleUpload(file: File) {
    setPending(true);
    try {
      const clientId = crypto.randomUUID();
      const ticketRes = await createLessonUploadTickets({
        lessonId,
        files: [{ clientId, fileName: file.name, mimeType: file.type, sizeBytes: file.size }],
      });
      if ("error" in ticketRes) return addToast(ticketRes.error, "error");
      if (ticketRes.errors.length > 0) return addToast(ticketRes.errors[0].error, "error");
      const up = await uploadFileToLearningTicket(ticketRes.tickets[0], file, LEARNING_ATTACHMENT_BUCKET);
      if ("error" in up) return addToast(up.error, "error");
      const reg = await registerLessonUpload({ lessonId, ref: up.ref });
      if ("error" in reg) return addToast(reg.error, "error");
      onChange({
        attachmentId: reg.attachment.id,
        storagePath: reg.attachment.storage_path,
        fileName: reg.attachment.file_name,
        mimeType: reg.attachment.mime_type,
        sizeBytes: reg.attachment.size_bytes,
      });
    } finally {
      setPending(false);
    }
  }

  if (!block.storagePath) {
    return (
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-8 text-sm text-gray-400 transition hover:border-primary hover:bg-primary/5 hover:text-primary disabled:opacity-50 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]"
      >
        {pending ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : (
          <>
            <Upload className="h-6 w-6" />
            Datei hochladen
            <span className="text-xs text-gray-300">PDF, Office-Dokumente, Videos · max. 25 MB</span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={LEARNING_ATTACHMENT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
            e.target.value = "";
          }}
        />
      </button>
    );
  }

  const ext = (block.fileName.split(".").pop() ?? "FILE").slice(0, 4).toUpperCase();

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 dark:border-[#2c2c2e]/50 dark:bg-[#222224]">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
          {ext}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
            <Paperclip className="mr-1 inline h-3.5 w-3.5 text-gray-400" />
            {block.fileName}
          </p>
          <p className="text-xs text-gray-400">{formatBytes(block.sizeBytes)}</p>
        </div>
      </div>
      {signedUrl && (
        <a
          href={signedUrl}
          target="_blank"
          rel="noopener noreferrer"
          download={block.fileName}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white dark:border-[#2c2c2e]/50 dark:text-gray-300 dark:hover:bg-white/5"
        >
          <Download className="h-3.5 w-3.5" /> Öffnen
        </a>
      )}
    </div>
  );
}
