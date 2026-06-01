import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { loadCustomer } from "@/lib/fulfillment/data";
import { getOrCreateBoard, loadPostsForBoard } from "@/lib/social/data";
import { SocialBoardClient } from "./_components/social-board-client";

export const dynamic = "force-dynamic";

export default async function SocialMediaBoardPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  const customer = await loadCustomer(leadId);
  if (!customer) notFound();

  const board = await getOrCreateBoard(leadId, null);
  const posts = board ? await loadPostsForBoard(board.id) : [];

  return (
    <div className="space-y-6">
      <Link
        href="/fulfillment/social-media"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      >
        <ArrowLeft className="h-4 w-4" /> Zurück zur Übersicht
      </Link>

      <SocialBoardClient
        leadId={leadId}
        customerName={customer.company_name ?? ""}
        board={board ? { share_token: board.share_token, share_enabled: board.share_enabled } : null}
        posts={posts}
      />
    </div>
  );
}
