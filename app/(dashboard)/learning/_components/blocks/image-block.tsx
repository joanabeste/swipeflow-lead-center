"use client";

import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Loader2, Upload } from "lucide-react";
import { useToastContext } from "../../../toast-provider";
import { createLessonUploadTickets, registerLessonUpload } from "../../_actions/attachments";
import { uploadFileToLearningTicket } from "../../_lib/client-upload";
import { LEARNING_ATTACHMENT_BUCKET } from "../../_lib/format";
import type { LearningBlock } from "@/lib/types";

type ImageBlockData = Extract<LearningBlock, { type: "image" }>;

interface Props {
  lessonId: string;
  block: ImageBlockData;
  onChange: (patch: Partial<Omit<ImageBlockData, "id" | "type">>) => void;
  autoFocus?: boolean;
}

export function ImageBlock({ lessonId, block, onChange }: Props) {
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
    if (!file.type.startsWith("image/")) {
      addToast("Bitte ein Bild auswählen.", "error");
      return;
    }
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
        className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-10 text-sm text-gray-400 transition hover:border-primary hover:bg-primary/5 hover:text-primary disabled:opacity-50 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]"
      >
        {pending ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : (
          <>
            <Upload className="h-6 w-6" />
            Bild hochladen
            <span className="text-xs text-gray-300">JPEG / PNG / WebP / GIF</span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
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

  return (
    <div className="space-y-2">
      {signedUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={signedUrl}
          alt={block.caption ?? block.fileName}
          className="mx-auto max-h-[480px] rounded-xl"
        />
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-xl bg-gray-100 text-gray-400 dark:bg-[#1c1c1e]">
          <ImageIcon className="h-8 w-8" />
        </div>
      )}
      <input
        defaultValue={block.caption ?? ""}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v !== (block.caption ?? "")) onChange({ caption: v || null });
        }}
        placeholder="Bildunterschrift (optional)"
        className="block w-full border-0 bg-transparent text-center text-xs text-gray-500 placeholder-gray-300 focus:outline-none dark:text-gray-400"
      />
    </div>
  );
}
