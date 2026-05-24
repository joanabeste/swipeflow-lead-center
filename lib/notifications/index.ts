import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  link: string | null;
  actor_id: string | null;
  read_at: string | null;
  created_at: string;
}

export async function createNotification(input: {
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  link?: string | null;
  actorId?: string | null;
}): Promise<{ ok: true; id: string } | { error: string }> {
  // Sich selbst nichts schicken.
  if (input.actorId && input.actorId === input.userId) return { ok: true, id: "self-skipped" };

  const db = createServiceClient();
  const { data, error } = await db
    .from("notifications")
    .insert({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      link: input.link ?? null,
      actor_id: input.actorId ?? null,
    })
    .select("id")
    .single();
  if (error) {
    if (/relation.*does not exist/i.test(error.message)) {
      return { error: "Tabelle notifications fehlt — Migration 083 ausfuehren." };
    }
    return { error: error.message };
  }
  return { ok: true, id: data.id as string };
}

/**
 * Parst @-Mentions aus einem Text-Block. Erkennt:
 *  - @email-prefix (z.B. @joana fuer joana@swipeflow.agency)
 *  - @firstname.lastname (z.B. @joana.beste)
 *  - @firstname (case-insensitive Match auf profile name)
 *
 * Liefert eindeutige Profile-IDs zurueck (max. 1 Notification pro User pro Notiz).
 */
export async function resolveMentions(content: string): Promise<{ ids: string[]; matched: { handle: string; id: string }[] }> {
  const matches = Array.from(content.matchAll(/@([a-z0-9._-]+)/gi)).map((m) => m[1].toLowerCase());
  if (matches.length === 0) return { ids: [], matched: [] };
  const uniqueHandles = Array.from(new Set(matches));

  const db = createServiceClient();
  const { data: profiles } = await db
    .from("profiles")
    .select("id, name, email")
    .eq("status", "active");
  if (!profiles) return { ids: [], matched: [] };

  const ids = new Set<string>();
  const matched: { handle: string; id: string }[] = [];

  for (const handle of uniqueHandles) {
    const found = profiles.find((p) => {
      const email = (p.email as string | null)?.toLowerCase() ?? "";
      const name = (p.name as string | null)?.toLowerCase() ?? "";
      const emailPrefix = email.split("@")[0];
      const nameFlat = name.replace(/\s+/g, ".");
      const firstName = name.split(/\s+/)[0];
      return (
        handle === emailPrefix ||
        handle === nameFlat ||
        handle === firstName ||
        handle === email
      );
    });
    if (found && !ids.has(found.id as string)) {
      ids.add(found.id as string);
      matched.push({ handle, id: found.id as string });
    }
  }
  return { ids: Array.from(ids), matched };
}

/** Laedt eigene Notifications, neueste zuerst. Limit default 30. */
export async function loadOwnNotifications(userId: string, limit = 30): Promise<NotificationRow[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (!/relation.*does not exist/i.test(error.message)) console.error("[loadOwnNotifications]", error);
    return [];
  }
  return (data ?? []) as NotificationRow[];
}

export async function countOwnUnread(userId: string): Promise<number> {
  const db = createServiceClient();
  const { count, error } = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) return 0;
  return count ?? 0;
}
