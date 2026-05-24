"use client";

import type { Editor, Range } from "@tiptap/core";
import type { LucideIcon } from "lucide-react";

export interface SlashCommand {
  id: string;
  group: "inhalt" | "medien" | "ki";
  title: string;
  hint?: string;
  icon: LucideIcon;
  /** Wird mit aktuellem Editor + dem Range (slash-Eingabe) aufgerufen. */
  run: (props: { editor: Editor; range: Range }) => void | boolean | Promise<void | boolean | unknown>;
  /** Optional: nur sichtbar wenn selection vorhanden. */
  requiresSelection?: boolean;
}

export const GROUP_LABELS: Record<SlashCommand["group"], string> = {
  inhalt: "Inhalt",
  medien: "Medien",
  ki: "KI",
};
