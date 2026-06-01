"use client";

import type { PostWithMediaAndComments } from "@/lib/social/types";
import { PublicPostCard } from "./public-post-card";

export function PublicBoardView({
  token,
  clientLabel,
  posts,
}: {
  token: string;
  clientLabel: string | null;
  posts: PostWithMediaAndComments[];
}) {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-[#0d0d0f]">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-[#2c2c2e] dark:bg-[#161618]/90">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">swipeflow · Content-Freigabe</p>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{clientLabel || "Deine Beiträge"}</h1>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        {posts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-400 dark:border-[#2c2c2e] dark:bg-[#161618]">
            Aktuell gibt es keine Beiträge zur Freigabe. Schau später wieder vorbei.
          </p>
        ) : (
          posts.map((post) => <PublicPostCard key={post.id} token={token} post={post} />)
        )}

        <p className="pb-8 pt-2 text-center text-[11px] text-gray-400">
          Bereitgestellt von der swipeflow GmbH
        </p>
      </div>
    </main>
  );
}
