"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu, FloatingMenu } from "@tiptap/react/menus";
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
  Bold,
  Italic,
  Link as LinkIcon,
  Plus,
  UploadCloud,
  ChevronDown,
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

  // Media-Insert-Handler — werden von SlashMenu, Toolbar, FloatingMenu und Hero genutzt.
  // Diese Funktionen müssen vor dem Editor definiert sein, da der Slash-Command-Setup-Effekt
  // den Editor in Closure hat. Sie greifen via `editorRef.current` auf den Editor zu.
  const editorRef = useRef<ReturnType<typeof useEditor> | null>(null);

  async function pickImage() {
    const ed = editorRef.current;
    if (!ed) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const attrs = await uploadFile(f);
      if (attrs?.signedUrl) {
        ed.chain().focus().setImage({ src: attrs.signedUrl, alt: attrs.fileName }).run();
      }
    };
    input.click();
  }

  async function pickFile() {
    const ed = editorRef.current;
    if (!ed) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = LEARNING_ATTACHMENT_ACCEPT;
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const attrs = await uploadFile(f);
      if (attrs) ed.chain().focus().setFileBlock(attrs).run();
    };
    input.click();
  }

  async function insertYouTube() {
    const ed = editorRef.current;
    if (!ed) return;
    const url = await dialog.prompt({
      title: "YouTube-URL einfügen",
      placeholder: "https://youtube.com/watch?v=…",
    });
    if (!url?.trim()) return;
    ed.chain().focus().setYoutubeVideo({ src: url.trim() }).run();
  }

  async function insertLoom() {
    const ed = editorRef.current;
    if (!ed) return;
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
    ed.chain().focus().setLoom({ videoId: id }).run();
  }

  async function promptLink() {
    const ed = editorRef.current;
    if (!ed) return;
    const url = await dialog.prompt({
      title: "Link einfügen",
      placeholder: "https://…",
    });
    if (!url?.trim()) return;
    ed.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  // Editor-Empty-State für Hero + Drag-State für Drop-Overlay
  const [isEmpty, setIsEmpty] = useState(true);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounterRef = useRef(0);

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
        showOnlyCurrent: false,
        placeholder: ({ node }) => {
          if (node.type.name === "heading") return "Überschrift…";
          return "Schreibe los — oder tippe / für Blöcke (Video, Datei, Liste…)";
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
    onCreate: ({ editor }) => {
      setIsEmpty(editor.isEmpty);
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      setIsEmpty(editor.isEmpty);
      autosave.schedule(async () => updateLesson({ id: lesson.id, content_html: html }));
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

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
        run: () => pickImage(),
      },
      {
        id: "file",
        group: "medien",
        title: "Datei hochladen",
        hint: "PDF, Office-Dokumente, Videos",
        icon: Paperclip,
        run: () => pickFile(),
      },
      {
        id: "youtube",
        group: "medien",
        title: "YouTube-Video",
        hint: "URL einfügen",
        icon: YoutubeIcon,
        run: () => insertYouTube(),
      },
      {
        id: "loom",
        group: "medien",
        title: "Loom-Video",
        hint: "URL einfügen",
        icon: Video,
        run: () => insertLoom(),
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

  function onDragEnterFile(e: React.DragEvent) {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    dragCounterRef.current += 1;
    setIsDraggingFile(true);
  }
  function onDragLeaveFile() {
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setIsDraggingFile(false);
  }
  function resetDrag() {
    dragCounterRef.current = 0;
    setIsDraggingFile(false);
  }

  if (!editor) {
    return <div className="min-h-[60vh] animate-pulse rounded-xl bg-gray-100 dark:bg-[#1c1c1e]" />;
  }

  return (
    <div className="min-h-full bg-gray-50 px-4 py-8 dark:bg-[#0f0f10]">
      <div
        className="relative mx-auto max-w-[800px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-[#2c2c2e]/50 dark:bg-[#161618]"
        onDragEnter={onDragEnterFile}
        onDragLeave={onDragLeaveFile}
        onDrop={resetDrag}
      >
        <div className="px-10 pt-12 pb-4 sm:px-14">
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
            className="w-full border-0 bg-transparent text-3xl font-bold text-gray-900 placeholder-gray-300 focus:outline-none dark:text-gray-100 dark:placeholder-gray-600"
          />
        </div>

        <EditorToolbar
          editor={editor}
          onPickImage={pickImage}
          onPickFile={pickFile}
          onInsertYouTube={insertYouTube}
          onInsertLoom={insertLoom}
          onPromptLink={promptLink}
          onRunAi={runAi}
        />

        <div className="relative px-10 pb-16 pt-4 sm:px-14">
          <EditorContent editor={editor} />

          {isEmpty && (
            <EmptyLessonHero
              onText={() => editor.chain().focus().run()}
              onPickImage={pickImage}
              onPickFile={pickFile}
              onInsertYouTube={insertYouTube}
              onInsertLoom={insertLoom}
            />
          )}
        </div>

        <BubbleMenu
          editor={editor}
          options={{ placement: "top" }}
          className="flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]"
        >
          <ToolbarBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Fett (⌘B)">
            <Bold className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Kursiv (⌘I)">
            <Italic className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn active={editor.isActive("link")} onClick={promptLink} title="Link">
            <LinkIcon className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <div className="mx-1 h-4 w-px bg-gray-200 dark:bg-[#2c2c2e]/60" />
          <ToolbarBtn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Überschrift 2">
            <Heading2 className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Liste">
            <List className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <div className="mx-1 h-4 w-px bg-gray-200 dark:bg-[#2c2c2e]/60" />
          <ToolbarBtn onClick={() => void runAi("shorten")} title="Mit KI kürzen">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </ToolbarBtn>
        </BubbleMenu>

        <FloatingMenu
          editor={editor}
          options={{ placement: "left" }}
          className="-translate-x-2"
        >
          <FloatingPlusMenu
            onHeading={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            onBullet={() => editor.chain().focus().toggleBulletList().run()}
            onPickImage={pickImage}
            onPickFile={pickFile}
            onInsertYouTube={insertYouTube}
            onInsertLoom={insertLoom}
          />
        </FloatingMenu>

        {isDraggingFile && (
          <div className="pointer-events-none absolute inset-3 z-30 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-sm">
            <UploadCloud className="h-10 w-10 text-primary" />
            <p className="text-sm font-semibold text-primary">Datei hier ablegen</p>
            <p className="text-xs text-primary/80">Wird in die Lektion eingefügt</p>
          </div>
        )}
      </div>

      {aiPending && (
        <div className="pointer-events-none fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-gray-900 shadow-xl">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> KI arbeitet…
        </div>
      )}
    </div>
  );
}

// ─── Toolbar-Komponenten ───────────────────────────────────────────

type Ed = NonNullable<ReturnType<typeof useEditor>>;

function ToolbarBtn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`rounded-md p-1.5 transition ${
        active
          ? "bg-primary/15 text-primary"
          : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
      }`}
    >
      {children}
    </button>
  );
}

function EditorToolbar({
  editor,
  onPickImage,
  onPickFile,
  onInsertYouTube,
  onInsertLoom,
  onPromptLink,
  onRunAi,
}: {
  editor: Ed;
  onPickImage: () => void;
  onPickFile: () => void;
  onInsertYouTube: () => void;
  onInsertLoom: () => void;
  onPromptLink: () => void;
  onRunAi: (mode: RewriteMode) => void;
}) {
  const [aiOpen, setAiOpen] = useState(false);
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-1 border-y border-gray-200 bg-white/95 px-4 py-1.5 backdrop-blur dark:border-[#2c2c2e]/50 dark:bg-[#161618]/95">
      {/* Headings */}
      <ToolbarBtn active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Überschrift 1">
        <Heading1 className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Überschrift 2">
        <Heading2 className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Überschrift 3">
        <Heading3 className="h-4 w-4" />
      </ToolbarBtn>
      <div className="mx-1 h-4 w-px bg-gray-200 dark:bg-[#2c2c2e]/60" />
      {/* Lists */}
      <ToolbarBtn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Aufzählung">
        <List className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Nummerierte Liste">
        <ListOrdered className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()} title="Aufgaben-Liste">
        <ListChecks className="h-4 w-4" />
      </ToolbarBtn>
      <div className="mx-1 h-4 w-px bg-gray-200 dark:bg-[#2c2c2e]/60" />
      {/* Inline */}
      <ToolbarBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Fett (⌘B)">
        <Bold className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Kursiv (⌘I)">
        <Italic className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn active={editor.isActive("link")} onClick={onPromptLink} title="Link">
        <LinkIcon className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Zitat">
        <Quote className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Codeblock">
        <Code className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Trennlinie">
        <Minus className="h-4 w-4" />
      </ToolbarBtn>

      <div className="mx-2 h-4 w-px bg-gray-200 dark:bg-[#2c2c2e]/60" />
      {/* Media — auffällig mit Beschriftung */}
      <button
        type="button"
        onClick={onPickImage}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
        title="Bild einfügen"
      >
        <ImageIcon className="h-4 w-4" /> Bild
      </button>
      <button
        type="button"
        onClick={onPickFile}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
        title="Datei einfügen"
      >
        <Paperclip className="h-4 w-4" /> Datei
      </button>
      <button
        type="button"
        onClick={onInsertYouTube}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
        title="YouTube-Video einbetten"
      >
        <YoutubeIcon className="h-4 w-4" /> YouTube
      </button>
      <button
        type="button"
        onClick={onInsertLoom}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
        title="Loom-Video einbetten"
      >
        <Video className="h-4 w-4" /> Loom
      </button>

      <div className="ml-auto flex items-center gap-1">
        <div className="relative">
          <button
            type="button"
            onClick={() => setAiOpen((v) => !v)}
            className="flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
            title="KI-Aktion auf Auswahl"
          >
            <Sparkles className="h-3.5 w-3.5" /> KI <ChevronDown className="h-3 w-3" />
          </button>
          {aiOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setAiOpen(false)} />
              <div className="absolute right-0 z-40 mt-1 min-w-[200px] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 text-xs shadow-lg dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
                {[
                  { mode: "shorten" as const, label: "Auswahl kürzen", icon: Scissors },
                  { mode: "formal" as const, label: "Formeller schreiben", icon: Wand2 },
                  { mode: "simpler" as const, label: "Einfacher erklären", icon: Languages },
                  { mode: "bullets" as const, label: "In Stichpunkte umwandeln", icon: ListTree },
                ].map(({ mode, label, icon: Icon }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setAiOpen(false);
                      onRunAi(mode);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
                  >
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FloatingPlusMenu({
  onHeading,
  onBullet,
  onPickImage,
  onPickFile,
  onInsertYouTube,
  onInsertLoom,
}: {
  onHeading: () => void;
  onBullet: () => void;
  onPickImage: () => void;
  onPickFile: () => void;
  onInsertYouTube: () => void;
  onInsertLoom: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Block hinzufügen — oder tippe /"
        className="flex h-6 w-6 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-400 shadow-sm transition hover:border-primary hover:text-primary dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e] dark:text-gray-500"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-7 top-0 z-40 min-w-[180px] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 text-xs shadow-lg dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
            {[
              { label: "Überschrift", icon: Heading2, action: onHeading },
              { label: "Aufzählung", icon: List, action: onBullet },
              { label: "Bild", icon: ImageIcon, action: onPickImage },
              { label: "Datei", icon: Paperclip, action: onPickFile },
              { label: "YouTube", icon: YoutubeIcon, action: onInsertYouTube },
              { label: "Loom", icon: Video, action: onInsertLoom },
            ].map(({ label, icon: Icon, action }) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  action();
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
              >
                <Icon className="h-3.5 w-3.5 text-gray-400" /> {label}
              </button>
            ))}
            <div className="border-t border-gray-100 px-3 py-1 text-[10px] text-gray-400 dark:border-[#2c2c2e]/40">
              Tipp: tippe / für alle Befehle
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function EmptyLessonHero({
  onText,
  onPickImage,
  onPickFile,
  onInsertYouTube,
  onInsertLoom,
}: {
  onText: () => void;
  onPickImage: () => void;
  onPickFile: () => void;
  onInsertYouTube: () => void;
  onInsertLoom: () => void;
}) {
  const cards: Array<{ icon: typeof Type; title: string; body: string; onClick: () => void }> = [
    { icon: Type, title: "Text schreiben", body: "Loslegen oder / tippen", onClick: onText },
    { icon: YoutubeIcon, title: "YouTube", body: "Video einbetten", onClick: onInsertYouTube },
    { icon: Video, title: "Loom", body: "Aufnahme einbetten", onClick: onInsertLoom },
    { icon: Paperclip, title: "Datei", body: "PDF, Slides, Doc", onClick: onPickFile },
    { icon: ImageIcon, title: "Bild", body: "Bild hochladen", onClick: onPickImage },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-12">
      <div className="pointer-events-auto w-full max-w-md space-y-3 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Diese Lektion ist leer. Wähle einen Block-Typ — oder schreibe einfach los.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {cards.map(({ icon: Icon, title, body, onClick }) => (
            <button
              key={title}
              type="button"
              onClick={onClick}
              className="flex flex-col items-start gap-1 rounded-xl border border-gray-200 bg-gray-50/60 p-3 text-left transition hover:border-primary hover:bg-primary/5 dark:border-[#2c2c2e]/50 dark:bg-white/[0.02] dark:hover:bg-primary/10"
            >
              <Icon className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{title}</span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400">{body}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
