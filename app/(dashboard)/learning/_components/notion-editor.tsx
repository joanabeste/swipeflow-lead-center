"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Youtube from "@tiptap/extension-youtube";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Minus,
  Code,
  Type,
  Image as ImageIcon,
  Paperclip,
  PlayCircle as YoutubeIcon,
  Video,
  Sparkles,
  Scissors,
  Wand2,
  Languages,
  ListTree,
  Loader2,
} from "lucide-react";
import { useToastContext } from "../../toast-provider";
import { useDialog } from "@/components/dialog";
import type { LearningLesson, LoadedLearningAttachment } from "@/lib/types";
import { updateLesson } from "../_actions/courses";
import { createLessonUploadTickets, registerLessonUpload } from "../_actions/attachments";
import { uploadFileToLearningTicket } from "../_lib/client-upload";
import { rewriteText, type RewriteMode } from "../_actions/ai";
import { LEARNING_ATTACHMENT_ACCEPT, LEARNING_ATTACHMENT_BUCKET, parseVideoUrl } from "../_lib/format";
import { Loom, extractLoomId } from "./extensions/loom";
import { FileBlock, type FileBlockAttrs } from "./extensions/file-block";
import { SlashMenu } from "./extensions/slash-menu";
import type { SlashCommand } from "./extensions/slash-menu-types";
import { useAutosave, type AutosaveResult } from "../_hooks/use-autosave";

interface Props {
  lesson: LearningLesson;
  initialAttachments: LoadedLearningAttachment[];
  onLessonChange: (next: LearningLesson) => void;
  onSaveStateChange: (state: AutosaveResult) => void;
}

/**
 * Notion-Style Lesson-Editor. Eine Lektion = eine freie Page.
 * - Title als H1 oben
 * - Block-Editor unten mit Slash-Commands, Auto-Embed (YouTube/Loom), Drop-Upload
 */
export function NotionLessonEditor({
  lesson,
  initialAttachments,
  onLessonChange,
  onSaveStateChange,
}: Props) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const dialog = useDialog();
  const autosave = useAutosave(800);
  const [aiPending, setAiPending] = useState(false);

  useEffect(() => {
    onSaveStateChange(autosave);
  }, [autosave.state, autosave.lastSavedAt, autosave.error]); // eslint-disable-line react-hooks/exhaustive-deps

  // Upload-Funktion fuer File-Block + Image-Block
  async function uploadFile(file: File): Promise<FileBlockAttrs | null> {
    const clientId = crypto.randomUUID();
    const ticketRes = await createLessonUploadTickets({
      lessonId: lesson.id,
      files: [{ clientId, fileName: file.name, mimeType: file.type, sizeBytes: file.size }],
    });
    if ("error" in ticketRes) {
      addToast(ticketRes.error, "error");
      return null;
    }
    if (ticketRes.errors.length > 0) {
      addToast(ticketRes.errors[0].error, "error");
      return null;
    }
    const up = await uploadFileToLearningTicket(ticketRes.tickets[0], file, LEARNING_ATTACHMENT_BUCKET);
    if ("error" in up) {
      addToast(up.error, "error");
      return null;
    }
    const reg = await registerLessonUpload({ lessonId: lesson.id, ref: up.ref });
    if ("error" in reg) {
      addToast(reg.error, "error");
      return null;
    }
    // Signed URL fuer Anzeige holen
    const { createClient } = await import("@/lib/supabase/client");
    const sb = createClient();
    const { data: signed } = await sb.storage
      .from(LEARNING_ATTACHMENT_BUCKET)
      .createSignedUrl(reg.attachment.storage_path, 60 * 60 * 24 * 7);
    return {
      attachmentId: reg.attachment.id,
      storagePath: reg.attachment.storage_path,
      fileName: reg.attachment.file_name,
      mimeType: reg.attachment.mime_type,
      sizeBytes: reg.attachment.size_bytes,
      signedUrl: signed?.signedUrl ?? null,
    };
  }

  // KI-Rewrite-Helper
  async function runAi(mode: RewriteMode, instruction?: string) {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) {
      addToast("Wähle erst Text aus, der umgeschrieben werden soll.", "info");
      return;
    }
    const selectedText = editor.state.doc.textBetween(from, to, " ");
    if (!selectedText.trim()) return;
    setAiPending(true);
    try {
      const res = await rewriteText({ mode, text: selectedText, instruction });
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      editor.chain().focus().deleteRange({ from, to }).insertContent(res.text).run();
    } finally {
      setAiPending(false);
    }
  }

  // Slash-Commands definieren (laufen ueber slashCommandsRef damit editor in Closure stimmt)
  const slashCommandsRef = useRef<SlashCommand[]>([]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer" } }),
      Image.configure({ HTMLAttributes: { class: "rounded-lg" } }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === "heading") return "Überschrift…";
          return "Tippe '/' für Befehle, oder schreibe los…";
        },
      }),
      Youtube.configure({ controls: true, nocookie: true, HTMLAttributes: { class: "rounded-xl my-3" } }),
      Loom,
      FileBlock,
      SlashMenu.configure({ items: [] }), // wird unten dynamisch nachgereicht
    ],
    content: lesson.content_html ?? "",
    editorProps: {
      attributes: {
        class:
          "lesson-content min-h-[60vh] max-w-none focus:outline-none text-[15px] leading-relaxed text-gray-800 dark:text-gray-100",
      },
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData("text/plain")?.trim();
        if (!text) return false;
        // YouTube wird automatisch durch Youtube-Extension PasteRule erkannt — Loom durch Loom-Extension.
        // Hier: zusaetzlich generischer Fallback fuer Video-URLs (sicherheitshalber).
        const parsed = parseVideoUrl(text);
        if (parsed?.provider === "loom") {
          const id = extractLoomId(text);
          if (id) {
            editor?.chain().focus().setLoom({ videoId: id }).run();
            event.preventDefault();
            return true;
          }
        }
        return false;
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        event.preventDefault();
        const file = files[0];
        void uploadFile(file).then((attrs) => {
          if (!attrs) return;
          if (attrs.mimeType.startsWith("image/") && attrs.signedUrl) {
            editor?.chain().focus().setImage({ src: attrs.signedUrl, alt: attrs.fileName }).run();
          } else {
            editor?.chain().focus().setFileBlock(attrs).run();
          }
        });
        return true;
      },
    },
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      autosave.schedule(async () => updateLesson({ id: lesson.id, content_html: html }));
    },
  });

  // Initial Image-signedUrls hydraten: alte FileBlock-Nodes haben keine signedUrl in HTML.
  // Wir laufen einmalig durch alle Nodes und füllen signedUrl aus initialAttachments nach.
  useEffect(() => {
    if (!editor) return;
    const map = new Map(initialAttachments.map((a) => [a.id, a.signed_url]));
    let changed = false;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== "fileBlock") return;
      const id = node.attrs.attachmentId as string | null;
      const currentUrl = node.attrs.signedUrl as string | null;
      if (id && !currentUrl && map.has(id)) {
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            signedUrl: map.get(id) ?? null,
          }),
        );
        changed = true;
      }
    });
    // No save needed — signedUrl ist als rendered:false markiert
    void changed;
  }, [editor, initialAttachments]);

  // Slash-Commands aufbauen (mit Editor-Closure)
  useEffect(() => {
    if (!editor) return;
    const cmds: SlashCommand[] = [
      // INHALT
      {
        id: "h1",
        group: "inhalt",
        title: "Überschrift 1",
        hint: "Große Section-Überschrift",
        icon: Heading1,
        run: ({ editor }) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      },
      {
        id: "h2",
        group: "inhalt",
        title: "Überschrift 2",
        icon: Heading2,
        run: ({ editor }) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        id: "h3",
        group: "inhalt",
        title: "Überschrift 3",
        icon: Heading3,
        run: ({ editor }) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      },
      {
        id: "paragraph",
        group: "inhalt",
        title: "Absatz",
        icon: Type,
        run: ({ editor }) => editor.chain().focus().setParagraph().run(),
      },
      {
        id: "bullet",
        group: "inhalt",
        title: "Aufzählung",
        icon: List,
        run: ({ editor }) => editor.chain().focus().toggleBulletList().run(),
      },
      {
        id: "ordered",
        group: "inhalt",
        title: "Nummerierte Liste",
        icon: ListOrdered,
        run: ({ editor }) => editor.chain().focus().toggleOrderedList().run(),
      },
      {
        id: "tasks",
        group: "inhalt",
        title: "Aufgaben-Liste",
        icon: ListChecks,
        run: ({ editor }) => editor.chain().focus().toggleTaskList().run(),
      },
      {
        id: "quote",
        group: "inhalt",
        title: "Zitat",
        icon: Quote,
        run: ({ editor }) => editor.chain().focus().toggleBlockquote().run(),
      },
      {
        id: "code",
        group: "inhalt",
        title: "Codeblock",
        icon: Code,
        run: ({ editor }) => editor.chain().focus().toggleCodeBlock().run(),
      },
      {
        id: "divider",
        group: "inhalt",
        title: "Trennlinie",
        icon: Minus,
        run: ({ editor }) => editor.chain().focus().setHorizontalRule().run(),
      },
      // MEDIEN
      {
        id: "image",
        group: "medien",
        title: "Bild hochladen",
        icon: ImageIcon,
        run: async ({ editor }) => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";
          input.onchange = async () => {
            const f = input.files?.[0];
            if (!f) return;
            const attrs = await uploadFile(f);
            if (attrs?.signedUrl) {
              editor.chain().focus().setImage({ src: attrs.signedUrl, alt: attrs.fileName }).run();
            }
          };
          input.click();
        },
      },
      {
        id: "file",
        group: "medien",
        title: "Datei hochladen",
        hint: "PDF, Office-Dokumente, Videos",
        icon: Paperclip,
        run: async ({ editor }) => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = LEARNING_ATTACHMENT_ACCEPT;
          input.onchange = async () => {
            const f = input.files?.[0];
            if (!f) return;
            const attrs = await uploadFile(f);
            if (attrs) editor.chain().focus().setFileBlock(attrs).run();
          };
          input.click();
        },
      },
      {
        id: "youtube",
        group: "medien",
        title: "YouTube-Video",
        hint: "URL einfügen",
        icon: YoutubeIcon,
        run: async ({ editor }) => {
          const url = await dialog.prompt({
            title: "YouTube-URL einfügen",
            placeholder: "https://youtube.com/watch?v=…",
          });
          if (!url?.trim()) return;
          editor.chain().focus().setYoutubeVideo({ src: url.trim() }).run();
        },
      },
      {
        id: "loom",
        group: "medien",
        title: "Loom-Video",
        hint: "URL einfügen",
        icon: Video,
        run: async ({ editor }) => {
          const url = await dialog.prompt({
            title: "Loom-URL einfügen",
            placeholder: "https://loom.com/share/…",
          });
          if (!url?.trim()) return;
          const id = extractLoomId(url.trim());
          if (!id) {
            addToast("Konnte Loom-ID nicht erkennen.", "error");
            return;
          }
          editor.chain().focus().setLoom({ videoId: id }).run();
        },
      },
      // KI
      {
        id: "ai-shorten",
        group: "ki",
        title: "Auswahl kürzen",
        hint: "Selektion umschreiben",
        icon: Scissors,
        run: () => runAi("shorten"),
        requiresSelection: true,
      },
      {
        id: "ai-formal",
        group: "ki",
        title: "Formeller schreiben",
        icon: Wand2,
        run: () => runAi("formal"),
        requiresSelection: true,
      },
      {
        id: "ai-simpler",
        group: "ki",
        title: "Einfacher erklären",
        icon: Languages,
        run: () => runAi("simpler"),
        requiresSelection: true,
      },
      {
        id: "ai-bullets",
        group: "ki",
        title: "In Stichpunkte umwandeln",
        icon: ListTree,
        run: () => runAi("bullets"),
        requiresSelection: true,
      },
      {
        id: "ai-custom",
        group: "ki",
        title: "Frei umschreiben",
        hint: "Eigene Anweisung",
        icon: Sparkles,
        run: async () => {
          const instruction = await dialog.prompt({
            title: "Wie soll der Text umgeschrieben werden?",
            placeholder: "z.B. 'In Du-Form formulieren'",
          });
          if (!instruction?.trim()) return;
          await runAi("custom", instruction);
        },
        requiresSelection: true,
      },
    ];
    slashCommandsRef.current = cmds;
    // Extension-Options updaten (zeigt aktuelle Cmds beim nächsten Trigger)
    const ext = editor.extensionManager.extensions.find((e) => e.name === "slashMenu");
    if (ext) ext.options.items = cmds;
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  const lessonId = lesson.id;
  const titleSavedRef = useRef(lesson.title);
  useEffect(() => {
    titleSavedRef.current = lesson.title;
  }, [lesson.title]);

  if (!editor) {
    return <div className="min-h-[60vh] animate-pulse rounded-xl bg-gray-100 dark:bg-[#1c1c1e]" />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-6 py-8">
      <input
        defaultValue={lesson.title}
        key={lessonId + ":title"}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v && v !== titleSavedRef.current) {
            const next = { ...lesson, title: v };
            onLessonChange(next);
            autosave.schedule(async () => updateLesson({ id: lessonId, title: v }));
          }
        }}
        placeholder="Lektions-Titel…"
        className="w-full border-0 bg-transparent text-3xl font-bold text-gray-900 placeholder-gray-300 focus:outline-none dark:text-gray-100"
      />

      <EditorContent editor={editor} />

      {aiPending && (
        <div className="pointer-events-none fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-gray-900 shadow-xl">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> KI arbeitet…
        </div>
      )}
    </div>
  );
}
