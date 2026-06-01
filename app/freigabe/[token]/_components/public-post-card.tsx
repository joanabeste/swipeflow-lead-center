"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, MessageSquare, Loader2, CalendarClock } from "lucide-react";
import {
  FORMAT_LABELS,
  PLATFORM_LABELS,
  type Platform,
} from "@/lib/social/format";
import type { PostWithMediaAndComments } from "@/lib/social/types";
import { MediaGallery } from "./media-gallery";
import { approvePost, requestChanges, submitComment } from "../actions";

function formatScheduled(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return null;
  }
}

export function PublicPostCard({
  token,
  post,
  authorName,
}: {
  token: string;
  post: PostWithMediaAndComments;
  authorName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"standard" | Platform>("standard");

  const captionForView = view === "standard" ? post.caption : post.platform_captions?.[view] || post.caption;
  const showCaptionTabs = post.platforms.length > 1 && Object.keys(post.platform_captions ?? {}).length > 0;
  const scheduled = formatScheduled(post.scheduled_at);
  const isApproved = post.status === "approved";

  function ensureName(): boolean {
    if (!authorName.trim()) {
      setError("Bitte trage oben deinen Namen ein.");
      return false;
    }
    return true;
  }

  function run(action: () => Promise<{ success: true } | { error: string }>, clearText = false) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if ("error" in res) {
        setError(res.error);
        return;
      }
      if (clearText) setText("");
      router.refresh();
    });
  }

  function onComment() {
    if (!ensureName()) return;
    if (!text.trim()) {
      setError("Bitte gib einen Kommentar ein.");
      return;
    }
    run(() => submitComment(token, post.id, { authorName, body: text }), true);
  }

  function onRequestChanges() {
    if (!ensureName()) return;
    if (!text.trim()) {
      setError("Bitte beschreibe kurz, was geändert werden soll.");
      return;
    }
    run(() => requestChanges(token, post.id, { authorName, body: text }), true);
  }

  function onApprove() {
    if (!ensureName()) return;
    run(() => approvePost(token, post.id, { authorName }));
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-[#2c2c2e] dark:bg-[#161618]">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-2.5 dark:border-[#2c2c2e]/50">
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300">
            {FORMAT_LABELS[post.format]}
          </span>
          {post.platforms.map((p) => (
            <span key={p}>{PLATFORM_LABELS[p]}</span>
          ))}
        </div>
        <StatusBadge status={post.status} />
      </div>

      <div className="p-4">
        <MediaGallery media={post.media} />

        {showCaptionTabs && (
          <div className="mt-3 inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs dark:border-[#2c2c2e] dark:bg-white/5">
            <button
              type="button"
              onClick={() => setView("standard")}
              className={`rounded-md px-2 py-1 font-medium ${view === "standard" ? "bg-white shadow-sm dark:bg-[#1c1c1e]" : "text-gray-500"}`}
            >
              Standard
            </button>
            {post.platforms.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setView(p)}
                className={`rounded-md px-2 py-1 font-medium ${view === p ? "bg-white shadow-sm dark:bg-[#1c1c1e]" : "text-gray-500"}`}
              >
                {PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>
        )}

        {captionForView && (
          <p className="mt-3 whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">{captionForView}</p>
        )}

        {scheduled && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <CalendarClock className="h-3.5 w-3.5" /> Geplant: {scheduled}
          </p>
        )}
      </div>

      {/* Kommentar-Verlauf */}
      {post.comments.length > 0 && (
        <div className="space-y-2 border-t border-gray-100 px-4 py-3 dark:border-[#2c2c2e]/50">
          {post.comments.map((c) => {
            const isClient = c.author_kind === "client";
            const evt =
              c.event === "approved" ? "✓ Freigegeben" : c.event === "changes_requested" ? "✎ Änderung angefordert" : null;
            return (
              <div key={c.id} className="text-sm">
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                  {isClient ? c.author_name || "Du" : "swipeflow"}
                </span>
                {evt && (
                  <span className={`ml-2 text-[11px] font-semibold ${c.event === "approved" ? "text-green-600" : "text-amber-600"}`}>
                    {evt}
                  </span>
                )}
                {c.body && <p className="whitespace-pre-wrap text-gray-700 dark:text-gray-200">{c.body}</p>}
              </div>
            );
          })}
        </div>
      )}

      {/* Aktionen */}
      <div className="space-y-2 border-t border-gray-100 px-4 py-3 dark:border-[#2c2c2e]/50">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Kommentar oder gewünschte Änderung …"
          className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-[#2c2c2e] dark:bg-[#1c1c1e] dark:text-gray-100"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onApprove}
            disabled={pending || isApproved}
            className="inline-flex items-center gap-1.5 rounded-xl bg-green-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {isApproved ? "Freigegeben" : "Freigeben"}
          </button>
          <button
            type="button"
            onClick={onRequestChanges}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-50 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200"
          >
            Änderung anfordern
          </button>
          <button
            type="button"
            onClick={onComment}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-white/5"
          >
            <MessageSquare className="h-4 w-4" /> Kommentar
          </button>
        </div>
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: PostWithMediaAndComments["status"] }) {
  const map: Record<string, { label: string; cls: string }> = {
    in_review: { label: "Wartet auf Freigabe", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
    changes_requested: { label: "Änderung angefordert", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
    approved: { label: "Freigegeben", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  };
  const it = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-600" };
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${it.cls}`}>{it.label}</span>;
}
