"use client";

import { useEffect, useState } from "react";
import type { PostWithMediaAndComments } from "@/lib/social/types";
import { PublicPostCard } from "./public-post-card";

const NAME_KEY = "social-freigabe:name";

export function PublicBoardView({
  token,
  clientLabel,
  posts,
}: {
  token: string;
  clientLabel: string | null;
  posts: PostWithMediaAndComments[];
}) {
  const [name, setName] = useState("");

  // Mount-only: Namen aus localStorage hydratisieren (kein Server/Client-Mismatch).
  useEffect(() => {
    const stored = window.localStorage.getItem(NAME_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setName(stored);
  }, []);

  function updateName(v: string) {
    setName(v);
    window.localStorage.setItem(NAME_KEY, v);
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-[#0d0d0f]">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-[#2c2c2e] dark:bg-[#161618]/90">
        <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">swipeflow · Content-Freigabe</p>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{clientLabel || "Deine Beiträge"}</h1>
          </div>
          <label className="block sm:w-64">
            <span className="mb-1 block text-[11px] font-medium text-gray-500 dark:text-gray-400">Dein Name</span>
            <input
              value={name}
              onChange={(e) => updateName(e.target.value)}
              placeholder="Für Kommentare & Freigaben"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-[#2c2c2e] dark:bg-[#1c1c1e] dark:text-gray-100"
            />
          </label>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        {posts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-400 dark:border-[#2c2c2e] dark:bg-[#161618]">
            Aktuell gibt es keine Beiträge zur Freigabe. Schau später wieder vorbei.
          </p>
        ) : (
          posts.map((post) => <PublicPostCard key={post.id} token={token} post={post} authorName={name} />)
        )}

        <p className="pb-8 pt-2 text-center text-[11px] text-gray-400">
          Bereitgestellt von der swipeflow GmbH
        </p>
      </div>
    </main>
  );
}
