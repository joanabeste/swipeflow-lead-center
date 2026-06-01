import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { CLIENT_VISIBLE_STATUSES } from "./format";
import { loadPostMediaForPosts } from "./attachments";
import type {
  PostWithMedia,
  PostWithMediaAndComments,
  SocialBoard,
  SocialComment,
  SocialPost,
} from "./types";

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  return /relation.*does not exist|column.*does not exist/i.test(error.message ?? "");
}

// ─── Boards ─────────────────────────────────────────────────────────────────

export async function loadBoardByProject(projectId: string): Promise<SocialBoard | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("social_boards")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle<SocialBoard>();
  if (error) {
    if (!isMissingTable(error)) console.error("[loadBoardByProject]", error);
    return null;
  }
  return data;
}

/** Holt das Board des Projekts oder legt es an (1:1 via UNIQUE project_id). */
export async function getOrCreateBoard(
  projectId: string,
  leadId: string,
  userId: string | null,
): Promise<SocialBoard | null> {
  const existing = await loadBoardByProject(projectId);
  if (existing) return existing;

  const db = createServiceClient();
  const { data, error } = await db
    .from("social_boards")
    .upsert(
      { project_id: projectId, lead_id: leadId, created_by: userId },
      { onConflict: "project_id", ignoreDuplicates: true },
    )
    .select()
    .maybeSingle<SocialBoard>();
  if (error) {
    if (!isMissingTable(error)) console.error("[getOrCreateBoard]", error);
    return null;
  }
  // ignoreDuplicates → bei Race kein Row zurück; dann erneut laden.
  return data ?? (await loadBoardByProject(projectId));
}

/** Lädt das Board zu einem Freigabe-Token — nur wenn der Link aktiv ist. */
export async function loadBoardByToken(token: string): Promise<SocialBoard | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("social_boards")
    .select("*")
    .eq("share_token", token)
    .eq("share_enabled", true)
    .maybeSingle<SocialBoard>();
  if (error) {
    if (!isMissingTable(error)) console.error("[loadBoardByToken]", error);
    return null;
  }
  return data;
}

// ─── Posts ──────────────────────────────────────────────────────────────────

async function attachMediaAndCounts(
  posts: SocialPost[],
  mediaTtlSec: number,
): Promise<PostWithMedia[]> {
  if (posts.length === 0) return [];
  const ids = posts.map((p) => p.id);
  const db = createServiceClient();

  const [mediaMap, countRes] = await Promise.all([
    loadPostMediaForPosts(ids, mediaTtlSec),
    db.from("social_post_comments").select("post_id").in("post_id", ids),
  ]);

  const countByPost = new Map<string, number>();
  for (const r of (countRes.data ?? []) as Array<{ post_id: string }>) {
    countByPost.set(r.post_id, (countByPost.get(r.post_id) ?? 0) + 1);
  }

  return posts.map((p) => ({
    ...p,
    media: mediaMap.get(p.id) ?? [],
    comment_count: countByPost.get(p.id) ?? 0,
  }));
}

/**
 * Lädt alle Posts eines Boards inkl. Medien (signed URLs) + Kommentar-Zähler.
 * `publicOnly` filtert auf die für den Kunden sichtbaren Status.
 */
export async function loadPostsForBoard(
  boardId: string,
  opts?: { publicOnly?: boolean; mediaTtlSec?: number },
): Promise<PostWithMedia[]> {
  const db = createServiceClient();
  let q = db.from("social_posts").select("*").eq("board_id", boardId);
  if (opts?.publicOnly) q = q.in("status", [...CLIENT_VISIBLE_STATUSES]);
  q = q
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  const { data, error } = await q;
  if (error) {
    if (!isMissingTable(error)) console.error("[loadPostsForBoard]", error);
    return [];
  }
  return attachMediaAndCounts((data ?? []) as SocialPost[], opts?.mediaTtlSec ?? 3600);
}

export async function loadPost(postId: string): Promise<SocialPost | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("social_posts")
    .select("*")
    .eq("id", postId)
    .maybeSingle<SocialPost>();
  if (error) {
    console.error("[loadPost]", error);
    return null;
  }
  return data;
}

export async function loadCommentsForPost(postId: string): Promise<SocialComment[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("social_post_comments")
    .select("id, post_id, board_id, author_kind, author_user_id, author_name, body, event, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error) {
    if (!isMissingTable(error)) console.error("[loadCommentsForPost]", error);
    return [];
  }
  return (data ?? []) as SocialComment[];
}

/** Bulk-Fetch der Kommentare zu mehreren Posts, gruppiert nach post_id. */
export async function loadCommentsForPosts(postIds: string[]): Promise<Map<string, SocialComment[]>> {
  const map = new Map<string, SocialComment[]>();
  if (postIds.length === 0) return map;
  const db = createServiceClient();
  const { data, error } = await db
    .from("social_post_comments")
    .select("id, post_id, board_id, author_kind, author_user_id, author_name, body, event, created_at")
    .in("post_id", postIds)
    .order("created_at", { ascending: true });
  if (error) {
    if (!isMissingTable(error)) console.error("[loadCommentsForPosts]", error);
    return map;
  }
  for (const c of (data ?? []) as SocialComment[]) {
    const list = map.get(c.post_id) ?? [];
    list.push(c);
    map.set(c.post_id, list);
  }
  return map;
}

/** Ein Post mit Medien + vollständigem Kommentar-Thread (für Detail/Editor). */
export async function loadPostDetail(
  postId: string,
  mediaTtlSec = 3600,
): Promise<PostWithMediaAndComments | null> {
  const post = await loadPost(postId);
  if (!post) return null;
  const [mediaMap, comments] = await Promise.all([
    loadPostMediaForPosts([postId], mediaTtlSec),
    loadCommentsForPost(postId),
  ]);
  return { ...post, media: mediaMap.get(postId) ?? [], comments };
}

