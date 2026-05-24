"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Italic, Link as LinkIcon, List, ListOrdered, Heading2, Heading3 } from "lucide-react";
import { useDialog } from "@/components/dialog";

interface Props {
  html: string;
  onChange: (html: string) => void;
  autoFocus?: boolean;
}

/**
 * Mini-TipTap-Instanz pro Text-Block. Bewusst minimal:
 * - Inline: Fett, Kursiv, Link
 * - Block: Absatz, H2, H3, Bullet-Liste, Ordered-Liste
 * Toolbar ist permanent unter dem Editor, aber nur bei Focus sichtbar.
 */
export function TextBlock({ html, onChange, autoFocus }: Props) {
  const dialog = useDialog();
  const [focused, setFocused] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer", class: "text-primary underline" },
      }),
      Placeholder.configure({ placeholder: "Hier Text schreiben…" }),
    ],
    content: html,
    editorProps: {
      attributes: {
        class:
          "lesson-content min-h-[2.5em] max-w-none focus:outline-none text-[15px] leading-relaxed text-gray-800 dark:text-gray-100",
      },
    },
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    onFocus: () => setFocused(true),
    onBlur: () => {
      // Kurzer Delay damit Toolbar-Clicks noch durchgehen
      setTimeout(() => setFocused(false), 150);
    },
  });

  useEffect(() => {
    if (editor && autoFocus) {
      setTimeout(() => editor.commands.focus("end"), 50);
    }
  }, [editor, autoFocus]);

  if (!editor) {
    return <div className="min-h-[2.5em] animate-pulse rounded bg-gray-100 dark:bg-[#1c1c1e]" />;
  }

  async function handleLink() {
    const url = await dialog.prompt({
      title: "Link einfügen",
      body: "URL eingeben (leer lassen, um Link zu entfernen).",
      placeholder: "https://…",
    });
    if (url === null) return;
    if (url === "") {
      editor!.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor!.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  function btnCls(active: boolean) {
    return `inline-flex h-7 w-7 items-center justify-center rounded-md transition ${
      active
        ? "bg-primary/15 text-primary"
        : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
    }`;
  }

  return (
    <div className="space-y-2">
      <EditorContent editor={editor} />
      <div
        className={`flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white p-1 transition dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e] ${
          focused ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={btnCls(editor.isActive("bold"))}
          title="Fett"
        >
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={btnCls(editor.isActive("italic"))}
          title="Kursiv"
        >
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleLink}
          className={btnCls(editor.isActive("link"))}
          title="Link"
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </button>
        <span className="mx-0.5 h-4 w-px bg-gray-200 dark:bg-[#2c2c2e]" />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={btnCls(editor.isActive("heading", { level: 2 }))}
          title="Überschrift 2"
        >
          <Heading2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={btnCls(editor.isActive("heading", { level: 3 }))}
          title="Überschrift 3"
        >
          <Heading3 className="h-3.5 w-3.5" />
        </button>
        <span className="mx-0.5 h-4 w-px bg-gray-200 dark:bg-[#2c2c2e]" />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={btnCls(editor.isActive("bulletList"))}
          title="Aufzählung"
        >
          <List className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={btnCls(editor.isActive("orderedList"))}
          title="Nummerierte Liste"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
