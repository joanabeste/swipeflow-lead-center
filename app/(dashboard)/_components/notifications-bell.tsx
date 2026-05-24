"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Bell, Check } from "lucide-react";
import {
  fetchOwnNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notifications-actions";

interface Item {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

function fmtRelative(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return "gerade eben";
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 7) return `vor ${Math.floor(diff / 86400)} T`;
  return new Date(iso).toLocaleDateString("de-DE");
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  // Beim Mount + alle 60 Sekunden Unread-Count refreshen.
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const res = await fetchOwnNotifications();
      if (cancelled) return;
      setItems(res.items as Item[]);
      setUnread(res.unread);
    }
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Bei Open ebenfalls frisch laden — und Click-outside zum Schliessen.
  useEffect(() => {
    if (!open) return;
    fetchOwnNotifications().then((res) => {
      setItems(res.items as Item[]);
      setUnread(res.unread);
    });
    function handleClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function markOne(id: string) {
    startTransition(async () => {
      await markNotificationRead(id);
      setItems((cur) => cur.map((i) => (i.id === id ? { ...i, read_at: new Date().toISOString() } : i)));
      setUnread((c) => Math.max(0, c - 1));
    });
  }

  function markAll() {
    startTransition(async () => {
      await markAllNotificationsRead();
      setItems((cur) => cur.map((i) => ({ ...i, read_at: i.read_at ?? new Date().toISOString() })));
      setUnread(0);
    });
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Benachrichtigungen"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-gray-900">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-96 max-w-[calc(100vw-2rem)] origin-top-right overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-[#2c2c2e] dark:bg-[#161618]">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2 dark:border-[#2c2c2e]/60">
            <h3 className="text-sm font-semibold">Benachrichtigungen</h3>
            {unread > 0 && (
              <button
                onClick={markAll}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-white/5"
              >
                <Check className="h-3 w-3" /> Alle gelesen
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">Keine Benachrichtigungen.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto dark:divide-[#2c2c2e]/40">
              {items.map((n) => {
                const body = (
                  <div className={`flex gap-2 px-4 py-3 text-sm transition ${n.read_at ? "bg-white dark:bg-[#161618]" : "bg-primary/5 dark:bg-primary/10"}`}>
                    {!n.read_at && <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-primary" />}
                    <div className={`min-w-0 flex-1 ${n.read_at ? "pl-4" : ""}`}>
                      <p className="font-medium text-gray-900 dark:text-white">{n.title}</p>
                      {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{n.body}</p>}
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-gray-400">{fmtRelative(n.created_at)}</p>
                    </div>
                  </div>
                );
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link href={n.link} onClick={() => { if (!n.read_at) markOne(n.id); setOpen(false); }} className="block hover:bg-gray-50 dark:hover:bg-white/5">
                        {body}
                      </Link>
                    ) : (
                      <button type="button" onClick={() => !n.read_at && markOne(n.id)} className="block w-full text-left hover:bg-gray-50 dark:hover:bg-white/5">
                        {body}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
