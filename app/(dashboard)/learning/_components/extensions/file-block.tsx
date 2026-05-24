"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { FileText, Download, Trash2 } from "lucide-react";
import { formatBytes } from "../../_lib/format";

export interface FileBlockAttrs {
  attachmentId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  signedUrl: string | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fileBlock: {
      setFileBlock: (attrs: FileBlockAttrs) => ReturnType;
    };
  }
}

/**
 * File-Block Custom-Node. Speichert Metadaten als data-Attrs.
 * Server-Side serialisiert er als <div data-learning-file …>, Renderer macht
 * daraus eine Download-Card oder Bild-Embed (siehe lesson-renderer.tsx).
 */
export const FileBlock = Node.create({
  name: "fileBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      attachmentId: { default: null },
      storagePath: { default: null },
      fileName: { default: "" },
      mimeType: { default: "application/octet-stream" },
      sizeBytes: { default: 0 },
      // signedUrl wird nicht im HTML serialisiert — wird beim Render frisch geholt
      signedUrl: { default: null, rendered: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-learning-file]",
        getAttrs: (node) => {
          if (typeof node === "string") return false;
          const el = node as HTMLElement;
          return {
            attachmentId: el.getAttribute("data-attachment-id"),
            storagePath: el.getAttribute("data-storage-path"),
            fileName: el.getAttribute("data-file-name") ?? "",
            mimeType: el.getAttribute("data-mime-type") ?? "application/octet-stream",
            sizeBytes: Number(el.getAttribute("data-size-bytes") ?? "0"),
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        { "data-learning-file": "" },
        {
          "data-attachment-id": HTMLAttributes.attachmentId,
          "data-storage-path": HTMLAttributes.storagePath,
          "data-file-name": HTMLAttributes.fileName,
          "data-mime-type": HTMLAttributes.mimeType,
          "data-size-bytes": String(HTMLAttributes.sizeBytes ?? 0),
        },
      ),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FileBlockView);
  },

  addCommands() {
    return {
      setFileBlock:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({ type: this.name, attrs });
        },
    };
  },
});

function FileBlockView({ node, deleteNode, editor }: NodeViewProps) {
  const attrs = node.attrs as unknown as FileBlockAttrs;
  const isImage = attrs.mimeType.startsWith("image/");
  const isEditable = editor.isEditable;

  return (
    <NodeViewWrapper className="my-3">
      <div className="group relative rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-[#2c2c2e]/50 dark:bg-[#222224]">
        {isImage && attrs.signedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={attrs.signedUrl}
            alt={attrs.fileName}
            className="mx-auto max-h-96 rounded-lg object-contain"
          />
        ) : (
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold uppercase text-primary">
              {attrs.fileName.split(".").pop()?.slice(0, 4) || <FileText className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                {attrs.fileName}
              </p>
              <p className="text-xs text-gray-400">{formatBytes(attrs.sizeBytes)}</p>
            </div>
            {attrs.signedUrl && (
              <a
                href={attrs.signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                download={attrs.fileName}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white dark:border-[#2c2c2e]/50 dark:text-gray-300 dark:hover:bg-white/5"
              >
                <Download className="h-3.5 w-3.5" /> Öffnen
              </a>
            )}
          </div>
        )}
        {isEditable && (
          <button
            type="button"
            onClick={() => deleteNode()}
            className="absolute right-2 top-2 rounded-md bg-white/80 p-1 text-gray-400 opacity-0 transition group-hover:opacity-100 hover:text-red-500 dark:bg-[#1c1c1e]/80"
            title="Block entfernen"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </NodeViewWrapper>
  );
}
