import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { listCustomers } from "@/lib/fulfillment/data";
import type { Lead } from "@/lib/types";
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

export async function loadBoardByLead(leadId: string): Promise<SocialBoard | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("social_boards")
    .select("*")
    .eq("lead_id", leadId)
    .maybeSingle<SocialBoard>();
  if (error) {
    if (!isMissingTable(error)) console.error("[loadBoardByLead]", error);
    return null;
  }
  return data;
}

/** Holt das Board des Kunden oder legt es an (1:1 via UNIQUE lead_id). */
export async function getOrCreateBoard(leadId: string, userId: string | null): Promise<SocialBoard | null> {
  const existing = await loadBoardByLead(leadId);
  if (existing) return existing;

  const db = createServiceClient();
  const { data, error } = await db
    .from("social_boards")
    .upsert({ lead_id: leadId, created_by: userId }, { onConflict: "lead_id", ignoreDuplicates: true })
    .select()
    .maybeSingle<SocialBoard>();
  if (error) {
    if (!isMissingTable(error)) console.error("[getOrCreateBoard]", error);
    return null;
  }
  // ignoreDuplicates → bei Race kein Row zurück; dann erneut laden.
  return data ?? (await loadBoardByLead(leadId));
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

// ─── Kundenliste-Einstieg ───────────────────────────────────────────────────

export interface CustomerWithSocialStats {
  customer: Lead;
  board: { id: string; share_token: string | null; share_enabled: boolean } | null;
  total: number;
  pending: number; // in_review + changes_requested
  approved: number;
}

/** Kunden (lifecycle=customer) mit Social-Board-Kennzahlen für die Übersichtsseite. */
export async function listCustomersWithBoardStats(): Promise<CustomerWithSocialStats[]> {
  const customers = await listCustomers();
  if (customers.length === 0) return [];
  const ids = customers.map((c) => c.id);
  const db = createServiceClient();

  const [boardsRes, postsRes] = await Promise.all([
    db.from("social_boards").select("id, lead_id, share_token, share_enabled").in("lead_id", ids),
    db.from("social_posts").select("lead_id, status").in("lead_id", ids),
  ]);

  if (boardsRes.error && !isMissingTable(boardsRes.error)) console.error("[listCustomersWithBoardStats:boards]", boardsRes.error);
  if (postsRes.error && !isMissingTable(postsRes.error)) console.error("[listCustomersWithBoardStats:posts]", postsRes.error);

  const boardByLead = new Map<string, { id: string; share_token: string | null; share_enabled: boolean }>();
  for (const b of (boardsRes.data ?? []) as Array<{ id: string; lead_id: string; share_token: string | null; share_enabled: boolean }>) {
    boardByLead.set(b.lead_id, { id: b.id, share_token: b.share_token, share_enabled: b.share_enabled });
  }

  const stats = new Map<string, { total: number; pending: number; approved: number }>();
  for (const p of (postsRes.data ?? []) as Array<{ lead_id: string; status: string }>) {
    const s = stats.get(p.lead_id) ?? { total: 0, pending: 0, approved: 0 };
    s.total += 1;
    if (p.status === "in_review" || p.status === "changes_requested") s.pending += 1;
    if (p.status === "approved") s.approved += 1;
    stats.set(p.lead_id, s);
  }

  return customers.map((c) => {
    const s = stats.get(c.id) ?? { total: 0, pending: 0, approved: 0 };
    return {
      customer: c,
      board: boardByLead.get(c.id) ?? null,
      total: s.total,
      pending: s.pending,
      approved: s.approved,
    };
  });
}
