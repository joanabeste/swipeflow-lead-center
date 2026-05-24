"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDialog } from "@/components/dialog";
import { useToastContext } from "../../toast-provider";
import type { LearningBlock, LearningBlockType, LearningLesson, LoadedLearningAttachment } from "@/lib/types";
import { updateLesson } from "../_actions/courses";
import { deleteLessonAttachment } from "../_actions/attachments";
import { useAutosave, type AutosaveResult } from "../_hooks/use-autosave";
import { BlockFrame } from "./blocks/block-frame";
import { TextBlock } from "./blocks/text-block";
import { VideoBlock } from "./blocks/video-block";
import { ImageBlock } from "./blocks/image-block";
import { FileBlock } from "./blocks/file-block";
import { ButtonBlock } from "./blocks/button-block";
import { BlockAddBar } from "./block-add-bar";
import { BlockAddInline } from "./block-add-inline";
import { LegacyContentBox } from "./legacy-content-box";

interface Props {
  lesson: LearningLesson;
  initialAttachments: LoadedLearningAttachment[];
  onLessonChange: (next: LearningLesson) => void;
  onSaveStateChange: (state: AutosaveResult) => void;
}

function emptyBlock(type: LearningBlockType): LearningBlock {
  const id = crypto.randomUUID();
  switch (type) {
    case "text":
      return { id, type: "text", html: "" };
    case "video":
      return { id, type: "video", provider: "youtube", videoId: "", url: "" };
    case "image":
      return { id, type: "image", attachmentId: "", storagePath: "", fileName: "", caption: null };
    case "file":
      return { id, type: "file", attachmentId: "", storagePath: "", fileName: "", mimeType: "", sizeBytes: 0 };
    case "button":
      return { id, type: "button", label: "", url: "" };
  }
}

/**
 * Block-Stack-Editor: Title + vertikale Block-Liste + Add-Bar unten.
 * Auto-Save debounced. Bei alten Lessons mit content_html + ohne Blocks wird
 * eine Legacy-Box gezeigt mit Konvertier-Button.
 */
export function BlockEditor({ lesson, initialAttachments, onLessonChange, onSaveStateChange }: Props) {
  const dialog = useDialog();
  const { addToast } = useToastContext();
  const autosave = useAutosave(800);
  const [blocks, setBlocks] = useState<LearningBlock[]>(lesson.blocks ?? []);
  const [focusBlockId, setFocusBlockId] = useState<string | null>(null);
  const titleSavedRef = useRef(lesson.title);

  useEffect(() => onSaveStateChange(autosave), [autosave.state, autosave.lastSavedAt, autosave.error]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    titleSavedRef.current = lesson.title;
  }, [lesson.title]);

  const showLegacy = (lesson.blocks?.length ?? 0) === 0 && Boolean(lesson.content_html?.trim());

  const persistBlocks = useCallback(
    (next: LearningBlock[]) => {
      autosave.schedule(async () => updateLesson({ id: lesson.id, blocks: next }));
    },
    [autosave, lesson.id],
  );

  function updateBlocks(updater: (prev: LearningBlock[]) => LearningBlock[]) {
    setBlocks((prev) => {
      const next = updater(prev);
      persistBlocks(next);
      onLessonChange({ ...lesson, blocks: next });
      return next;
    });
  }

  function addBlock(type: LearningBlockType, atIndex?: number) {
    const block = emptyBlock(type);
    updateBlocks((prev) => {
      if (atIndex === undefined) return [...prev, block];
      const copy = [...prev];
      copy.splice(atIndex, 0, block);
      return copy;
    });
    setFocusBlockId(block.id);
  }

  function moveBlock(id: string, direction: -1 | 1) {
    updateBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      if (idx === -1) return prev;
      const target = idx + direction;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(idx, 1);
      copy.splice(target, 0, moved);
      return copy;
    });
  }

  async function deleteBlock(id: string) {
    const block = blocks.find((b) => b.id === id);
    if (!block) return;
    const ok = await dialog.confirm({
      title: "Block löschen?",
      danger: true,
      confirmLabel: "Löschen",
    });
    if (!ok) return;
    updateBlocks((prev) => prev.filter((b) => b.id !== id));
    // Bei File/Image: Attachment serverseitig wegräumen
    if ((block.type === "file" || block.type === "image") && block.attachmentId) {
      const res = await deleteLessonAttachment(block.attachmentId);
      if (res.error) addToast(`Anhang konnte nicht gelöscht werden: ${res.error}`, "error");
    }
  }

  function patchBlock(id: string, patch: Record<string, unknown>) {
    updateBlocks((prev) =>
      prev.map((b) => (b.id === id ? ({ ...b, ...patch } as LearningBlock) : b)),
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-2 px-6 py-8">
      <input
        defaultValue={lesson.title}
        key={lesson.id + ":title"}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v && v !== titleSavedRef.current) {
            const next = { ...lesson, title: v };
            onLessonChange(next);
            autosave.schedule(async () => updateLesson({ id: lesson.id, title: v }));
          }
        }}
        placeholder="Lektions-Titel…"
        className="w-full border-0 bg-transparent text-3xl font-bold text-gray-900 placeholder-gray-300 focus:outline-none dark:text-gray-100"
      />

      {showLegacy && (
        <div className="pt-4">
          <LegacyContentBox
            lessonId={lesson.id}
            contentHtml={lesson.content_html ?? ""}
            attachments={initialAttachments}
            onConverted={() => {
              // Nach Convert: Page-Refresh wird von LegacyContentBox angestossen
            }}
          />
        </div>
      )}

      {!showLegacy && (
        <div className="pt-4">
          {blocks.length === 0 ? (
            <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-400 dark:bg-[#1c1c1e]">
              Diese Lektion ist leer. Wähle unten einen Block-Typ.
            </p>
          ) : (
            <div className="space-y-1">
              {blocks.map((b, i) => (
                <div key={b.id}>
                  <BlockFrame
                    canMoveUp={i > 0}
                    canMoveDown={i < blocks.length - 1}
                    onMoveUp={() => moveBlock(b.id, -1)}
                    onMoveDown={() => moveBlock(b.id, 1)}
                    onDelete={() => deleteBlock(b.id)}
                  >
                    {renderBlock(b, lesson.id, focusBlockId === b.id, patchBlock)}
                  </BlockFrame>
                  {i < blocks.length - 1 && (
                    <BlockAddInline onAdd={(type) => addBlock(type, i + 1)} />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="pt-4">
            <BlockAddBar
              variant="bar"
              title={blocks.length === 0 ? "Erster Block" : "Block hinzufügen"}
              onAdd={(type) => addBlock(type)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function renderBlock(
  b: LearningBlock,
  lessonId: string,
  autoFocus: boolean,
  patchBlock: (id: string, patch: Record<string, unknown>) => void,
) {
  switch (b.type) {
    case "text":
      return <TextBlock html={b.html} onChange={(html) => patchBlock(b.id, { html })} autoFocus={autoFocus} />;
    case "video":
      return <VideoBlock block={b} onChange={(p) => patchBlock(b.id, p)} autoFocus={autoFocus} />;
    case "image":
      return <ImageBlock lessonId={lessonId} block={b} onChange={(p) => patchBlock(b.id, p)} autoFocus={autoFocus} />;
    case "file":
      return <FileBlock lessonId={lessonId} block={b} onChange={(p) => patchBlock(b.id, p)} />;
    case "button":
      return <ButtonBlock block={b} onChange={(p) => patchBlock(b.id, p)} autoFocus={autoFocus} />;
  }
}
