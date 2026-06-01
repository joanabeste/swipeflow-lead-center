"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import { loadCustomer } from "@/lib/fulfillment/data";
import { getOrCreateBoard, loadPost, loadCommentsForPost } from "@/lib/social/data";
import type { SocialComment } from "@/lib/social/types";
import {
  ensureBoardShareLink,
  disableShareLink as disableShareLinkLib,
  rotateShareToken as rotateShareTokenLib,
} from "@/lib/social/share";
import {
  createSocialMediaUploadTickets,
  registerPostMedia,
  deletePostMedia,
  deleteMediaForPost,
  reorderPostMedia,
} from "@/lib/social/attachments";
import { SELECTABLE_STATUSES, type Platform, type PostFormat, type PostStatus } from "@/lib/social/format";
import type { SocialUploadTicket, UploadedMediaRef } from "@/lib/social/format";
import { sendShareLinkEmail } from "@/lib/email/central";

type Result<T = unknown> = { success: true; data?: T } | { error: string };

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function dbError(prefix: string, error: { code?: string; message?: string }): string {
  console.error(`[${prefix}]`, error);
  if (error.code === "42P01" || /relation.*does not exist|column.*does not exist/i.test(error.message ?? "")) {
    return "Social-Media-Modul nicht migriert — Migration 109 in Supabase ausführen.";
  }
  return `DB-Fehler: ${error.message}`;
}

function revalidateLead(leadId: string) {
  revalidatePath("/fulfillment/social-media");
  revalidatePath(`/fulfillment/social-media/${leadId}`);
  revalidatePath(`/fulfillment/kunden/${leadId}`);
}

/** Reduziert platform_captions auf die aktiven Plattformen (droppt verwaiste Keys). */
function prunePlatformCaptions(
  captions: Partial<Record<Platform, string>> | undefined,
  platforms: Platform[],
): Partial<Record<Platform, string>> {
  if (!captions) return {};
  const out: Partial<Record<Platform, string>> = {};
  for (const p of platforms) {
    const v = captions[p];
    if (v && v.trim()) out[p] = v;
  }
  return out;
}

// ─── Posts ──────────────────────────────────────────────────────────────────

export async function createPost(input: {
  lead_id: string;
  title?: string;
  format?: PostFormat;
  platforms?: Platform[];
  caption?: string;
  platform_captions?: Partial<Record<Platform, string>>;
  scheduled_at?: string | null;
  status?: PostStatus;
}): Promise<Result<{ id: string }>> {
  const uid = await currentUserId();
  if (!uid) return { error: "Nicht angemeldet." };

  const board = await getOrCreateBoard(input.lead_id, uid);
  if (!board) return { error: "Board konnte nicht angelegt werden — Migration 109 prüfen." };

  const platforms = input.platforms ?? [];
  const db = createServiceClient();
  const { data, error } = await db
    .from("social_posts")
    .insert({
      board_id: board.id,
      lead_id: input.lead_id,
      title: input.title?.trim() || null,
      format: input.format ?? "feed_single",
      status: input.status ?? "draft",
      platforms,
      caption: input.caption ?? "",
      platform_captions: prunePlatformCaptions(input.platform_captions, platforms),
      scheduled_at: input.scheduled_at || null,
      created_by: uid,
    })
    .select("id")
    .single();
  if (error) return { error: dbError("createPost", error) };
  await logAudit({ userId: uid, action: "social.post.create", entityType: "social_post", entityId: data.id, details: { lead_id: input.lead_id } });
  revalidateLead(input.lead_id);
  return { success: true, data: { id: data.id } };
}

export async function updatePost(
  id: string,
  patch: Partial<{
    title: string | null;
    format: PostFormat;
    platforms: Platform[];
    caption: string;
    platform_captions: Partial<Record<Platform, string>>;
    scheduled_at: string | null;
    status: PostStatus;
  }>,
): Promise<Result> {
  const uid = await currentUserId();
  if (!uid) return { error: "Nicht angemeldet." };
  const db = createServiceClient();

  const post = await loadPost(id);
  if (!post) return { error: "Beitrag nicht gefunden." };

  const update: Record<string, unknown> = {};
  for (const k of ["format", "caption", "status"] as const) {
    if (patch[k] !== undefined) update[k] = patch[k];
  }
  if (patch.scheduled_at !== undefined) update.scheduled_at = patch.scheduled_at || null;
  if (patch.title !== undefined) update.title = (patch.title ?? "").trim() || null;

  const effectivePlatforms = patch.platforms ?? post.platforms;
  if (patch.platforms !== undefined) update.platforms = patch.platforms;
  if (patch.platform_captions !== undefined || patch.platforms !== undefined) {
    update.platform_captions = prunePlatformCaptions(
      patch.platform_captions ?? post.platform_captions,
      effectivePlatforms,
    );
  }
  if (patch.status === "approved" && !post.approved_at) {
    update.approved_at = new Date().toISOString();
  }

  const { error } = await db.from("social_posts").update(update).eq("id", id);
  if (error) return { error: dbError("updatePost", error) };
  await logAudit({ userId: uid, action: "social.post.update", entityType: "social_post", entityId: id });
  revalidateLead(post.lead_id);
  return { success: true };
}

export async function deletePost(id: string): Promise<Result> {
  const uid = await currentUserId();
  if (!uid) return { error: "Nicht angemeldet." };
  const post = await loadPost(id);
  if (!post) return { error: "Beitrag nicht gefunden." };

  // Storage-Objekte VOR dem DB-Delete entfernen (CASCADE räumt nur DB-Rows).
  await deleteMediaForPost(id);

  const db = createServiceClient();
  const { error } = await db.from("social_posts").delete().eq("id", id);
  if (error) return { error: dbError("deletePost", error) };
  await logAudit({ userId: uid, action: "social.post.delete", entityType: "social_post", entityId: id });
  revalidateLead(post.lead_id);
  return { success: true };
}

export async function updatePostStatus(id: string, status: PostStatus): Promise<Result> {
  const uid = await currentUserId();
  if (!uid) return { error: "Nicht angemeldet." };
  if (!SELECTABLE_STATUSES.includes(status)) return { error: "Ungültiger Status." };
  const post = await loadPost(id);
  if (!post) return { error: "Beitrag nicht gefunden." };

  const update: Record<string, unknown> = { status };
  if (status === "approved" && !post.approved_at) update.approved_at = new Date().toISOString();

  const db = createServiceClient();
  const { error } = await db.from("social_posts").update(update).eq("id", id);
  if (error) return { error: dbError("updatePostStatus", error) };
  await logAudit({ userId: uid, action: "social.post.status", entityType: "social_post", entityId: id, details: { status } });
  revalidateLead(post.lead_id);
  return { success: true };
}

// ─── Medien ─────────────────────────────────────────────────────────────────

export async function createPostMediaUploads(
  leadId: string,
  files: { clientId: string; fileName: string; mimeType: string; sizeBytes: number }[],
): Promise<{ tickets: SocialUploadTicket[]; errors: { clientId: string; error: string }[] } | { error: string }> {
  const uid = await currentUserId();
  if (!uid) return { error: "Nicht angemeldet." };
  return createSocialMediaUploadTickets({ leadId, files });
}

export async function attachPostMedia(postId: string, refs: UploadedMediaRef[]): Promise<Result> {
  const uid = await currentUserId();
  if (!uid) return { error: "Nicht angemeldet." };
  const post = await loadPost(postId);
  if (!post) return { error: "Beitrag nicht gefunden." };

  const db = createServiceClient();
  const { count } = await db
    .from("social_post_media")
    .select("id", { count: "exact", head: true })
    .eq("post_id", postId);
  const base = count ?? 0;

  let i = 0;
  for (const ref of refs) {
    const res = await registerPostMedia({ leadId: post.lead_id, postId, userId: uid, ref, sortOrder: base + i });
    if ("error" in res) return { error: res.error };
    i++;
  }
  await logAudit({ userId: uid, action: "social.post.media.add", entityType: "social_post", entityId: postId, details: { count: refs.length } });
  revalidateLead(post.lead_id);
  return { success: true };
}

export async function removePostMedia(mediaId: string, leadId: string): Promise<Result> {
  const uid = await currentUserId();
  if (!uid) return { error: "Nicht angemeldet." };
  const res = await deletePostMedia(mediaId);
  if (res.error) return { error: res.error };
  revalidateLead(leadId);
  return { success: true };
}

export async function reorderMedia(postId: string, orderedMediaIds: string[], leadId: string): Promise<Result> {
  const uid = await currentUserId();
  if (!uid) return { error: "Nicht angemeldet." };
  const res = await reorderPostMedia(postId, orderedMediaIds);
  if (res.error) return { error: res.error };
  revalidateLead(leadId);
  return { success: true };
}

// ─── Freigabelink ───────────────────────────────────────────────────────────

export async function ensureShareLink(leadId: string): Promise<{ url: string } | { error: string }> {
  const uid = await currentUserId();
  if (!uid) return { error: "Nicht angemeldet." };
  const res = await ensureBoardShareLink(leadId, uid);
  if ("error" in res) return { error: res.error };
  revalidateLead(leadId);
  return { url: res.url };
}

export async function disableShareLink(leadId: string): Promise<Result> {
  const uid = await currentUserId();
  if (!uid) return { error: "Nicht angemeldet." };
  const res = await disableShareLinkLib(leadId);
  if (res.error) return { error: res.error };
  await logAudit({ userId: uid, action: "social.share.disable", entityType: "social_board", entityId: leadId });
  revalidateLead(leadId);
  return { success: true };
}

export async function rotateShareToken(leadId: string): Promise<{ url: string } | { error: string }> {
  const uid = await currentUserId();
  if (!uid) return { error: "Nicht angemeldet." };
  const res = await rotateShareTokenLib(leadId, uid);
  if ("error" in res) return { error: res.error };
  await logAudit({ userId: uid, action: "social.share.rotate", entityType: "social_board", entityId: leadId });
  revalidateLead(leadId);
  return { url: res.url };
}

export async function sendShareLinkEmailAction(leadId: string, to: string): Promise<Result> {
  const uid = await currentUserId();
  if (!uid) return { error: "Nicht angemeldet." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to.trim())) return { error: "Bitte eine gültige E-Mail-Adresse angeben." };

  const link = await ensureBoardShareLink(leadId, uid);
  if ("error" in link) return { error: link.error };
  const customer = await loadCustomer(leadId);

  try {
    const res = await sendShareLinkEmail({ to: to.trim(), customerName: customer?.company_name ?? "", link: link.url });
    if (!res.ok) return { error: res.error };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "E-Mail-Versand fehlgeschlagen." };
  }
  await logAudit({ userId: uid, action: "social.share.email", entityType: "social_board", entityId: leadId, details: { to } });
  return { success: true };
}

// ─── Team-Kommentar ─────────────────────────────────────────────────────────

export async function getPostComments(postId: string): Promise<SocialComment[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  return loadCommentsForPost(postId);
}

export async function addTeamComment(postId: string, body: string): Promise<Result> {
  const uid = await currentUserId();
  if (!uid) return { error: "Nicht angemeldet." };
  if (!body.trim()) return { error: "Kommentar ist leer." };
  const post = await loadPost(postId);
  if (!post) return { error: "Beitrag nicht gefunden." };

  const db = createServiceClient();
  const { error } = await db.from("social_post_comments").insert({
    post_id: postId,
    board_id: post.board_id,
    author_kind: "team",
    author_user_id: uid,
    body: body.trim(),
  });
  if (error) return { error: dbError("addTeamComment", error) };
  revalidateLead(post.lead_id);
  return { success: true };
}
