"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Send, AlertTriangle, MessageSquare, Check } from "lucide-react";
import { Drawer } from "@/components/drawer";
import { useDialog } from "@/components/dialog";
import { Button } from "@/components/ui/button";
import {
  POST_FORMATS,
  FORMAT_LABELS,
  PLATFORMS,
  PLATFORM_LABELS,
  SELECTABLE_STATUSES,
  POST_STATUS_LABELS,
  CAPTION_MAX,
  validateMediaForFormat,
  type Platform,
  type PostFormat,
  type PostStatus,
} from "@/lib/social/format";
import type { PostWithMedia, SocialComment } from "@/lib/social/types";
import { useToastContext } from "../../../../toast-provider";
import { updatePost, deletePost, getPostComments, addTeamComment } from "../../actions";
import { PostMediaUploader } from "./post-media-uploader";

function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const STATUS_NEEDS_MEDIA: PostStatus[] = ["in_review", "changes_requested", "approved", "published"];

export function PostEditorDrawer({
  post,
  leadId,
  open,
  onClose,
}: {
  post: PostWithMedia | null;
  leadId: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const dialog = useDialog();
  const [, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [format, setFormat] = useState<PostFormat>("feed_single");
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [caption, setCaption] = useState("");
  const [platformCaptions, setPlatformCaptions] = useState<Partial<Record<Platform, string>>>({});
  const [scheduledLocal, setScheduledLocal] = useState("");
  const [status, setStatus] = useState<PostStatus>("draft");

  const [comments, setComments] = useState<SocialComment[]>([]);
  const [reply, setReply] = useState("");
  const seededId = useRef<string | null>(null);

  // Formular beim Wechsel des Posts neu befüllen.
  useEffect(() => {
    if (!post) {
      seededId.current = null;
      return;
    }
    if (seededId.current === post.id) return;
    seededId.current = post.id;
    /* eslint-disable react-hooks/set-state-in-effect */
    setTitle(post.title ?? "");
    setFormat(post.format);
    setPlatforms(post.platforms);
    setCaption(post.caption);
    setPlatformCaptions(post.platform_captions ?? {});
    setScheduledLocal(isoToLocalInput(post.scheduled_at));
    setStatus(post.status);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [post]);

  // Kommentare laden, wenn der Drawer für einen Post geöffnet wird.
  useEffect(() => {
    if (!open || !post) return;
    let active = true;
    getPostComments(post.id).then((c) => {
      if (active) setComments(c);
    });
    return () => {
      active = false;
    };
  }, [open, post]);

  function togglePlatform(p: Platform) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  function reloadComments() {
    if (post) getPostComments(post.id).then(setComments);
  }

  function handleSave() {
    if (!post) return;
    if (STATUS_NEEDS_MEDIA.includes(status)) {
      const err = validateMediaForFormat(format, post.media);
      if (err) {
        addToast(`Vor der Freigabe: ${err}`, "error");
        return;
      }
    }
    setSaving(true);
    startTransition(async () => {
      const res = await updatePost(post.id, {
        title: title.trim() || null,
        format,
        platforms,
        caption,
        platform_captions: platformCaptions,
        scheduled_at: localInputToIso(scheduledLocal),
        status,
      });
      setSaving(false);
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      addToast("Beitrag gespeichert.", "success");
      router.refresh();
    });
  }

  async function handleDelete() {
    if (!post) return;
    const ok = await dialog.confirm({
      title: "Beitrag löschen?",
      body: "Der Beitrag und alle zugehörigen Medien werden dauerhaft entfernt.",
      danger: true,
      confirmLabel: "Löschen",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await deletePost(post.id);
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      addToast("Beitrag gelöscht.", "success");
      onClose();
      router.refresh();
    });
  }

  function handleReply() {
    if (!post || !reply.trim()) return;
    startTransition(async () => {
      const res = await addTeamComment(post.id, reply);
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      setReply("");
      reloadComments();
      router.refresh();
    });
  }

  const inputCls =
    "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-[#2c2c2e] dark:bg-[#1c1c1e] dark:text-gray-100";

  return (
    <Drawer open={open} onClose={onClose} storageKey="social-post-editor:w" defaultWidth={620} title="Beitrag bearbeiten">
      {!post ? (
        <div className="p-6 text-sm text-gray-400">Wird geladen…</div>
      ) : (
        <div className="space-y-5 p-4">
          {post.status === "changes_requested" && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Der Kunde hat Änderungen angefordert. Passe den Beitrag an und stelle ihn erneut auf „In Freigabe&quot;.</span>
            </div>
          )}

          <Field label="Interner Titel">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Reel KW 23 – Vorher/Nachher" className={inputCls} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Format">
              <select value={format} onChange={(e) => setFormat(e.target.value as PostFormat)} className={inputCls}>
                {POST_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {FORMAT_LABELS[f]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value as PostStatus)} className={inputCls}>
                {SELECTABLE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {POST_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Plattformen">
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => {
                const active = platforms.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePlatform(p)}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium transition ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-[#2c2c2e] dark:text-gray-300 dark:hover:bg-white/5"
                    }`}
                  >
                    {active && <Check className="h-3.5 w-3.5" />} {PLATFORM_LABELS[p]}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Medien">
            <PostMediaUploader postId={post.id} leadId={leadId} media={post.media} onChanged={() => router.refresh()} />
          </Field>

          <Field label="Caption">
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={5}
              placeholder="Text, Emojis, Hashtags …"
              className={`${inputCls} resize-y`}
            />
            <p className="mt-1 text-right text-[11px] text-gray-400">{caption.length} Zeichen</p>
          </Field>

          {platforms.length > 1 && (
            <div className="space-y-3 rounded-xl border border-gray-100 p-3 dark:border-[#2c2c2e]/50">
              <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
                Plattform-spezifische Caption (optional)
              </p>
              {platforms.map((p) => {
                const val = platformCaptions[p] ?? "";
                return (
                  <Field key={p} label={PLATFORM_LABELS[p]}>
                    <textarea
                      value={val}
                      onChange={(e) => setPlatformCaptions((prev) => ({ ...prev, [p]: e.target.value }))}
                      rows={3}
                      placeholder={`Eigene Caption für ${PLATFORM_LABELS[p]} (leer = Standard)`}
                      className={`${inputCls} resize-y`}
                    />
                    <p className="mt-1 text-right text-[11px] text-gray-400">
                      {val.length}/{CAPTION_MAX[p]}
                    </p>
                  </Field>
                );
              })}
            </div>
          )}

          <Field label="Geplant für">
            <input type="datetime-local" value={scheduledLocal} onChange={(e) => setScheduledLocal(e.target.value)} className={inputCls} />
          </Field>

          {/* Freigabe-Verlauf / Kommentare */}
          <div className="space-y-2 border-t border-gray-100 pt-4 dark:border-[#2c2c2e]/50">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
              <MessageSquare className="h-3.5 w-3.5" /> Freigabe & Kommentare
            </p>
            {comments.length === 0 ? (
              <p className="text-xs text-gray-400">Noch keine Kommentare.</p>
            ) : (
              <ul className="space-y-2">
                {comments.map((c) => (
                  <CommentRow key={c.id} comment={c} />
                ))}
              </ul>
            )}
            <div className="flex items-end gap-2 pt-1">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={2}
                placeholder="Interne Antwort / Notiz …"
                className={`${inputCls} resize-none`}
              />
              <button
                type="button"
                onClick={handleReply}
                disabled={!reply.trim()}
                className="mb-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-gray-900 transition hover:bg-primary/90 disabled:opacity-50"
                title="Senden"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-gray-100 pt-4 dark:border-[#2c2c2e]/50">
            <Button variant="danger" onClick={handleDelete} className="!px-3">
              <Trash2 className="h-4 w-4" /> Löschen
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={onClose}>
                Schließen
              </Button>
              <Button variant="primary" onClick={handleSave} busy={saving}>
                Speichern
              </Button>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
      {children}
    </label>
  );
}

function CommentRow({ comment }: { comment: SocialComment }) {
  const isClient = comment.author_kind === "client";
  const eventLabel =
    comment.event === "approved" ? "✓ Freigegeben" : comment.event === "changes_requested" ? "✎ Änderung angefordert" : null;
  return (
    <li
      className={`rounded-xl border p-2.5 text-sm ${
        isClient
          ? "border-blue-100 bg-blue-50/50 dark:border-blue-900/30 dark:bg-blue-900/10"
          : "border-gray-100 bg-gray-50/60 dark:border-[#2c2c2e]/50 dark:bg-white/[0.02]"
      }`}
    >
      <div className="mb-0.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
          {isClient ? comment.author_name || "Kunde" : "Team"}
        </span>
        {eventLabel && (
          <span className={`text-[11px] font-semibold ${comment.event === "approved" ? "text-green-600" : "text-amber-600"}`}>
            {eventLabel}
          </span>
        )}
      </div>
      {comment.body && <p className="whitespace-pre-wrap text-gray-700 dark:text-gray-200">{comment.body}</p>}
    </li>
  );
}
