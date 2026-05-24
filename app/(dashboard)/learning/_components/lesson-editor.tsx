"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useState } from "react";
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Link as LinkIcon,
  ImagePlus,
  Quote,
  Undo2,
  Redo2,
} from "lucide-react";
import { createLessonUploadTickets, registerLessonUpload } from "../_actions/attachments";
import { uploadFileToLearningTicket } from "../_lib/client-upload";
import { LEARNING_ATTACHMENT_BUCKET } from "../_lib/format";
import { useToastContext } from "../../toast-provider";
import { useDialog } from "@/components/dialog";

interface Props {
  lessonId: string;
  initialHtml: string | null;
  onChange: (html: string) => void;
}

export function LessonEditor({ lessonId, initialHtml, onChange }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer" } }),
      Image.configure({ HTMLAttributes: { class: "rounded-lg" } }),
      Placeholder.configure({ placeholder: "Lektion-Inhalt verfassen…" }),
    ],
    content: initialHtml ?? "",
    editorProps: {
      attributes: {
        class:
          "lesson-content min-h-[300px] max-w-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e] dark:text-gray-100",
      },
    },
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  const [imgPending, setImgPending] = useState(false);
  const { addToast } = useToastContext();
  const dialog = useDialog();

  // Initial-Sync nach Mount, weil immediatelyRender:false (Next 16 + SSR)
  useEffect(() => {
    if (editor && initialHtml && editor.getHTML() !== initialHtml) {
      editor.commands.setContent(initialHtml);
    }
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!editor) {
    return (
      <div className="min-h-[300px] rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-400 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
        Editor lädt…
      </div>
    );
  }

  async function handleAddLink() {
    const url = await dialog.prompt({
      title: "Link einfügen",
      body: "URL eingeben (leer lassen, um den Link zu entfernen).",
      placeholder: "https://…",
    });
    if (url === null) return;
    if (url === "") {
      editor!.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor!.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  async function handleImageUpload(file: File) {
    setImgPending(true);
    try {
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
      const ticket = ticketRes.tickets[0];
      const up = await uploadFileToLearningTicket(ticket, file, LEARNING_ATTACHMENT_BUCKET);
      if ("error" in up) {
        addToast(up.error, "error");
        return;
      }
      const reg = await registerLessonUpload({ lessonId, ref: up.ref });
      if ("error" in reg) {
        addToast(reg.error, "error");
        return;
      }

      // Signed URL holen — hier reicht der bucket-pfad, oeffentlich via signed URL.
      // Wir bauen die URL via Browser-Client.
      const { createClient } = await import("@/lib/supabase/client");
      const sb = createClient();
      const { data: signed } = await sb.storage
        .from(LEARNING_ATTACHMENT_BUCKET)
        .createSignedUrl(reg.attachment.storage_path, 60 * 60 * 24 * 7);
      if (signed?.signedUrl) {
        editor!.chain().focus().setImage({ src: signed.signedUrl, alt: file.name }).run();
        addToast("Bild hochgeladen", "success");
      }
    } finally {
      setImgPending(false);
    }
  }

  function btnCls(active: boolean) {
    return `inline-flex h-8 w-8 items-center justify-center rounded-md transition ${
      active
        ? "bg-primary/10 text-primary"
        : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
    }`;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btnCls(editor.isActive("bold"))} title="Fett">
          <BoldIcon className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btnCls(editor.isActive("italic"))} title="Kursiv">
          <ItalicIcon className="h-4 w-4" />
        </button>
        <span className="mx-1 h-5 w-px bg-gray-200 dark:bg-[#2c2c2e]" />
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btnCls(editor.isActive("heading", { level: 2 }))} title="Überschrift 2">
          <Heading2 className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btnCls(editor.isActive("heading", { level: 3 }))} title="Überschrift 3">
          <Heading3 className="h-4 w-4" />
        </button>
        <span className="mx-1 h-5 w-px bg-gray-200 dark:bg-[#2c2c2e]" />
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btnCls(editor.isActive("bulletList"))} title="Aufzählung">
          <List className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btnCls(editor.isActive("orderedList"))} title="Nummerierte Liste">
          <ListOrdered className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btnCls(editor.isActive("blockquote"))} title="Zitat">
          <Quote className="h-4 w-4" />
        </button>
        <span className="mx-1 h-5 w-px bg-gray-200 dark:bg-[#2c2c2e]" />
        <button type="button" onClick={handleAddLink} className={btnCls(editor.isActive("link"))} title="Link einfügen">
          <LinkIcon className="h-4 w-4" />
        </button>
        <label className={btnCls(false) + " cursor-pointer" + (imgPending ? " opacity-50" : "")} title="Bild einfügen">
          <ImagePlus className="h-4 w-4" />
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={imgPending}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) await handleImageUpload(f);
              e.target.value = "";
            }}
          />
        </label>
        <span className="mx-1 h-5 w-px bg-gray-200 dark:bg-[#2c2c2e]" />
        <button type="button" onClick={() => editor.chain().focus().undo().run()} className={btnCls(false)} title="Rückgängig">
          <Undo2 className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()} className={btnCls(false)} title="Wiederherstellen">
          <Redo2 className="h-4 w-4" />
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
