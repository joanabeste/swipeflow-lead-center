"use server";

import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { loadBoardByToken } from "@/lib/social/data";
import { CLIENT_VISIBLE_STATUSES } from "@/lib/social/format";
import { sendPostFeedbackNotifyEmail, buildSocialBoardAdminUrl } from "@/lib/email/central";
import type { SocialBoard, SocialPost } from "@/lib/social/types";

type Result = { success: true } | { error: string };

const NAME_MAX = 120;
const BODY_MAX = 4000;

/** Lädt Board (per Token, aktiv) + Post und erzwingt, dass der Post zum Board
 *  gehört (verhindert IDOR über fremde Post-IDs). */
async function resolveBoardAndPost(
  token: string,
  postId: string,
): Promise<{ board: SocialBoard; post: SocialPost } | { error: string }> {
  const board = await loadBoardByToken(token);
  if (!board) return { error: "Dieser Link ist nicht mehr gültig." };
  const db = createServiceClient();
  const { data, error } = await db
    .from("social_posts")
    .select("*")
    .eq("id", postId)
    .eq("board_id", board.id)
    .maybeSingle<SocialPost>();
  if (error || !data) return { error: "Beitrag nicht gefunden." };
  if (!CLIENT_VISIBLE_STATUSES.includes(data.status)) {
    return { error: "Dieser Beitrag steht nicht zur Freigabe." };
  }
  return { board, post: data };
}

async function requestMeta(): Promise<{ ip: string | null; user_agent: string | null }> {
  const hdrs = await headers();
  return {
    ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    user_agent: hdrs.get("user-agent") ?? null,
  };
}

async function customerName(leadId: string): Promise<string> {
  const db = createServiceClient();
  const { data } = await db.from("leads").select("company_name").eq("id", leadId).maybeSingle();
  return (data?.company_name as string | null) ?? "";
}

function postLabel(post: SocialPost): string {
  return post.title?.trim() || post.caption.trim().slice(0, 60) || "Beitrag";
}

function clean(v: string | undefined, max: number): string {
  return (v ?? "").trim().slice(0, max);
}

export async function submitComment(
  token: string,
  postId: string,
  payload: { authorName?: string; body: string },
): Promise<Result> {
  const resolved = await resolveBoardAndPost(token, postId);
  if ("error" in resolved) return resolved;
  const { board, post } = resolved;

  const name = clean(payload.authorName, NAME_MAX);
  const body = clean(payload.body, BODY_MAX);
  if (!body) return { error: "Bitte gib einen Kommentar ein." };

  const db = createServiceClient();
  const meta = await requestMeta();
  const { error } = await db.from("social_post_comments").insert({
    post_id: post.id,
    board_id: board.id,
    author_kind: "client",
    author_name: name || null,
    body,
    meta,
  });
  if (error) {
    console.error("[freigabe:submitComment]", error);
    return { error: "Kommentar konnte nicht gespeichert werden." };
  }
  return { success: true };
}

export async function approvePost(
  token: string,
  postId: string,
  payload: { authorName?: string },
): Promise<Result> {
  const resolved = await resolveBoardAndPost(token, postId);
  if ("error" in resolved) return resolved;
  const { board, post } = resolved;

  const name = clean(payload.authorName, NAME_MAX);

  const db = createServiceClient();
  const signedAt = new Date().toISOString();
  // Atomar: nur aus in_review/changes_requested heraus.
  const { data: updated, error } = await db
    .from("social_posts")
    .update({ status: "approved", approved_at: signedAt, approved_by_name: name || null })
    .eq("id", post.id)
    .eq("board_id", board.id)
    .in("status", ["in_review", "changes_requested"])
    .select("id");
  if (error) {
    console.error("[freigabe:approvePost]", error);
    return { error: "Freigabe konnte nicht gespeichert werden." };
  }
  if (!updated || updated.length === 0) return { error: "Dieser Beitrag wurde bereits bearbeitet." };

  const meta = await requestMeta();
  await db.from("social_post_comments").insert({
    post_id: post.id,
    board_id: board.id,
    author_kind: "client",
    author_name: name || null,
    event: "approved",
    meta,
  });

  try {
    await sendPostFeedbackNotifyEmail({
      customerName: await customerName(board.lead_id),
      action: "approved",
      postTitle: postLabel(post),
      adminUrl: buildSocialBoardAdminUrl(board.project_id),
    });
  } catch (e) {
    console.error("[freigabe:approvePost:notify]", e);
  }
  return { success: true };
}

export async function requestChanges(
  token: string,
  postId: string,
  payload: { authorName?: string; body: string },
): Promise<Result> {
  const resolved = await resolveBoardAndPost(token, postId);
  if ("error" in resolved) return resolved;
  const { board, post } = resolved;

  const name = clean(payload.authorName, NAME_MAX);
  const body = clean(payload.body, BODY_MAX);
  if (!body) return { error: "Bitte beschreibe, was geändert werden soll." };

  const db = createServiceClient();
  const { data: updated, error } = await db
    .from("social_posts")
    .update({ status: "changes_requested", review_requested_at: new Date().toISOString() })
    .eq("id", post.id)
    .eq("board_id", board.id)
    .in("status", ["in_review", "changes_requested", "approved"])
    .select("id");
  if (error) {
    console.error("[freigabe:requestChanges]", error);
    return { error: "Anfrage konnte nicht gespeichert werden." };
  }
  if (!updated || updated.length === 0) return { error: "Dieser Beitrag wurde bereits bearbeitet." };

  const meta = await requestMeta();
  await db.from("social_post_comments").insert({
    post_id: post.id,
    board_id: board.id,
    author_kind: "client",
    author_name: name || null,
    body,
    event: "changes_requested",
    meta,
  });

  try {
    await sendPostFeedbackNotifyEmail({
      customerName: await customerName(board.lead_id),
      action: "changes_requested",
      postTitle: postLabel(post),
      comment: body,
      adminUrl: buildSocialBoardAdminUrl(board.project_id),
    });
  } catch (e) {
    console.error("[freigabe:requestChanges:notify]", e);
  }
  return { success: true };
}
