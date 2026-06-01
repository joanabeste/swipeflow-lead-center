import { getOrCreateBoard, loadPostsForBoard } from "@/lib/social/data";
import { SocialBoardClient } from "@/app/(dashboard)/fulfillment/social-media/[leadId]/_components/social-board-client";

export async function SocialTab({ leadId, customerName }: { leadId: string; customerName: string }) {
  const board = await getOrCreateBoard(leadId, null);
  const posts = board ? await loadPostsForBoard(board.id) : [];
  return (
    <SocialBoardClient
      leadId={leadId}
      customerName={customerName}
      board={board ? { share_token: board.share_token, share_enabled: board.share_enabled } : null}
      posts={posts}
      embedded
    />
  );
}
