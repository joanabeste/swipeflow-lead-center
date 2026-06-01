import { notFound } from "next/navigation";
import { loadBoardByToken, loadPostsForBoard, loadCommentsForPosts } from "@/lib/social/data";
import type { PostWithMediaAndComments } from "@/lib/social/types";
import { PublicBoardView } from "./_components/public-board-view";

export const dynamic = "force-dynamic";

export default async function FreigabePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const board = await loadBoardByToken(token);
  if (!board) notFound();

  // Nur für den Kunden sichtbare Status; großzügige TTL für Video-Signed-URLs.
  const posts = await loadPostsForBoard(board.id, { publicOnly: true, mediaTtlSec: 43200 });
  const commentsMap = await loadCommentsForPosts(posts.map((p) => p.id));
  const enriched: PostWithMediaAndComments[] = posts.map((p) => ({
    ...p,
    comments: commentsMap.get(p.id) ?? [],
  }));

  return <PublicBoardView token={token} clientLabel={board.client_label} posts={enriched} />;
}
