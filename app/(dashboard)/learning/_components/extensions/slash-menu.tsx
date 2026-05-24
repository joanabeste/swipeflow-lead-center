"use client";

import { Extension } from "@tiptap/core";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import "tippy.js/dist/tippy.css";
import type { SlashCommand } from "./slash-menu-types";
import { SlashMenuList, type SlashMenuListHandle } from "./slash-menu-list";

export interface SlashMenuOptions {
  /** Statische Item-Liste — wird beim Tippen nach Title gefiltert. */
  items: SlashCommand[];
}

/**
 * Slash-Menü-Extension. Triggert beim "/" und zeigt ein floating Menü mit
 * Inhalt-Blöcken (Heading, Liste, …), Medien-Blöcken und KI-Aktionen.
 */
export const SlashMenu = Extension.create<SlashMenuOptions>({
  name: "slashMenu",

  addOptions() {
    return { items: [] };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    const suggestion: Omit<SuggestionOptions<SlashCommand>, "editor"> = {
      char: "/",
      startOfLine: false,
      allowSpaces: false,
      items: ({ query }) => {
        const q = query.trim().toLowerCase();
        if (!q) return options.items;
        return options.items.filter(
          (i) => i.title.toLowerCase().includes(q) || i.id.toLowerCase().includes(q),
        );
      },
      command: ({ editor, range, props }) => {
        // Range = "/foo" — vor dem Run löschen, damit Item-Run mit leerer Stelle arbeitet
        editor.chain().focus().deleteRange(range).run();
        void props.run({ editor, range });
      },
      render: () => {
        let component: ReactRenderer<SlashMenuListHandle, React.ComponentProps<typeof SlashMenuList>> | null = null;
        let popup: TippyInstance[] | null = null;

        return {
          onStart: (props) => {
            component = new ReactRenderer(SlashMenuList, {
              props: { items: props.items, command: props.command },
              editor: props.editor,
            });

            if (!props.clientRect) return;
            popup = tippy("body", {
              getReferenceClientRect: props.clientRect as () => DOMRect,
              appendTo: () => document.body,
              content: component.element,
              showOnCreate: true,
              interactive: true,
              trigger: "manual",
              placement: "bottom-start",
              theme: "light",
              arrow: false,
              offset: [0, 4],
            });
          },
          onUpdate: (props) => {
            component?.updateProps({ items: props.items, command: props.command });
            if (props.clientRect && popup) {
              popup[0].setProps({ getReferenceClientRect: props.clientRect as () => DOMRect });
            }
          },
          onKeyDown: (props) => {
            if (props.event.key === "Escape") {
              popup?.[0].hide();
              return true;
            }
            return component?.ref?.onKeyDown(props) ?? false;
          },
          onExit: () => {
            popup?.[0].destroy();
            component?.destroy();
            popup = null;
            component = null;
          },
        };
      },
    };

    return [
      Suggestion({
        editor: this.editor,
        ...suggestion,
      }),
    ];
  },
});
