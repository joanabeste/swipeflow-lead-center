"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, CalendarDays, List, Plus, Share2 } from "lucide-react";
import type { PostWithMedia } from "@/lib/social/types";
import { useToastContext } from "../../../../toast-provider";
import { createPost } from "../../actions";
import { BoardView } from "./board-view";
import { CalendarView } from "./calendar-view";
import { ListView } from "./list-view";
import { PostEditorDrawer } from "./post-editor-drawer";
import { ShareLinkDialog } from "./share-link-dialog";

type View = "board" | "calendar" | "list";

export function SocialBoardClient({
  leadId,
  customerName,
  board,
  posts: initialPosts,
  embedded = false,
}: {
  leadId: string;
  customerName: string;
  board: { share_token: string | null; share_enabled: boolean } | null;
  posts: PostWithMedia[];
  /** Eingebettet im Kunden-Tab: eigener Seitentitel wird unterdrückt. */
  embedded?: boolean;
}) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [posts, setPosts] = useState<PostWithMedia[]>(initialPosts);
  const [view, setView] = useState<View>("board");
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [creating, startCreate] = useTransition();

  // Server bleibt Source of Truth — bei jedem refresh neu synchronisieren.
  useEffect(() => {
    setPosts(initialPosts);
  }, [initialPosts]);

  function handleNew() {
    startCreate(async () => {
      const res = await createPost({ lead_id: leadId, status: "draft" });
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      router.refresh();
      if (res.data?.id) setOpenPostId(res.data.id);
    });
  }

  const openPost = openPostId ? posts.find((p) => p.id === openPostId) ?? null : null;
  const shareActive = !!(board?.share_token && board.share_enabled);

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {embedded ? (
            <div />
          ) : (
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{customerName}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Social-Media-Content</p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                shareActive
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-[#2c2c2e] dark:text-gray-300 dark:hover:bg-white/5"
              }`}
            >
              <Share2 className="h-4 w-4" /> Freigabelink
            </button>
            <button
              type="button"
              onClick={handleNew}
              disabled={creating}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-gray-900 transition hover:bg-primary/90 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Neuer Beitrag
            </button>
          </div>
        </div>

        <div className="inline-flex w-fit rounded-xl border border-gray-200 bg-white p-1 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#161618]">
          <ViewTab active={view === "board"} onClick={() => setView("board")} icon={LayoutGrid} label="Board" />
          <ViewTab active={view === "calendar"} onClick={() => setView("calendar")} icon={CalendarDays} label="Kalender" />
          <ViewTab active={view === "list"} onClick={() => setView("list")} icon={List} label="Liste" />
        </div>

        {posts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-400 dark:border-[#2c2c2e]/60">
            Noch keine Beiträge. Lege mit „Neuer Beitrag&quot; los.
          </p>
        ) : view === "board" ? (
          <BoardView posts={posts} onEdit={(p) => setOpenPostId(p.id)} />
        ) : view === "calendar" ? (
          <CalendarView posts={posts} onEdit={(p) => setOpenPostId(p.id)} />
        ) : (
          <ListView posts={posts} onEdit={(p) => setOpenPostId(p.id)} />
        )}
      </div>

      <PostEditorDrawer
        post={openPost}
        leadId={leadId}
        open={openPostId !== null}
        onClose={() => setOpenPostId(null)}
      />

      <ShareLinkDialog
        leadId={leadId}
        customerName={customerName}
        open={shareOpen}
        initialActive={shareActive}
        onClose={() => setShareOpen(false)}
      />
    </>
  );
}

function ViewTab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof LayoutGrid;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition ${
        active
          ? "bg-primary text-gray-900 shadow-sm"
          : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
      }`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}
