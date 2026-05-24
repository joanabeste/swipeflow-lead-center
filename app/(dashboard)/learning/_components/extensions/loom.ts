"use client";

import { Node, mergeAttributes } from "@tiptap/core";

const LOOM_PATTERN = /https?:\/\/(?:www\.)?loom\.com\/(?:share|embed)\/([A-Za-z0-9]{8,})/i;

export interface LoomOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    loom: {
      setLoom: (options: { videoId: string }) => ReturnType;
    };
  }
}

/**
 * Loom-Video Custom-Node. Wird als <div data-loom-id="…"> serialisiert und
 * im Editor + Renderer als iframe-Embed angezeigt.
 *
 * Paste-Erkennung: Wird der Editor-Inhalt gepastet und eine Loom-URL gefunden,
 * wird sie automatisch in einen Loom-Block umgewandelt.
 */
export const Loom = Node.create<LoomOptions>({
  name: "loomVideo",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      videoId: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-loom-id]",
        getAttrs: (node) => {
          if (typeof node === "string") return false;
          const id = (node as HTMLElement).getAttribute("data-loom-id");
          return id ? { videoId: id } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const videoId = HTMLAttributes.videoId as string;
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, {
        "data-loom-id": videoId,
        class: "loom-embed aspect-video w-full overflow-hidden rounded-xl border border-gray-200 dark:border-[#2c2c2e]/50 my-3",
      }),
      [
        "iframe",
        {
          src: `https://www.loom.com/embed/${videoId}`,
          frameborder: "0",
          allowfullscreen: "true",
          class: "h-full w-full",
        },
      ],
    ];
  },

  addCommands() {
    return {
      setLoom:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },

  addPasteRules() {
    return [
      {
        find: new RegExp(LOOM_PATTERN.source, "gi"),
        handler: ({ range, match, commands }) => {
          const id = match[1];
          if (!id) return;
          commands.deleteRange(range);
          commands.insertContent({ type: this.name, attrs: { videoId: id } });
        },
      },
    ];
  },
});

export function extractLoomId(url: string): string | null {
  const m = url.match(LOOM_PATTERN);
  return m ? m[1] : null;
}
