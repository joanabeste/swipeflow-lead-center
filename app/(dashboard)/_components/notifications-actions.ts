"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { countOwnUnread, loadOwnNotifications, type NotificationRow } from "@/lib/notifications";

export async function fetchOwnNotifications(): Promise<{ items: NotificationRow[]; unread: number }> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { items: [], unread: 0 };
  const [items, unread] = await Promise.all([
    loadOwnNotifications(user.id),
    countOwnUnread(user.id),
  ]);
  return { items, unread };
}

export async function markNotificationRead(id: string): Promise<{ success: true } | { error: string }> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };
  const db = createServiceClient();
  const { error } = await db
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/");
  return { success: true };
}

export async function markAllNotificationsRead(): Promise<{ success: true; count: number } | { error: string }> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };
  const db = createServiceClient();
  const { error, count } = await db
    .from("notifications")
    .update({ read_at: new Date().toISOString() }, { count: "exact" })
    .eq("user_id", user.id)
    .is("read_at", null);
  if (error) return { error: error.message };
  revalidatePath("/");
  return { success: true, count: count ?? 0 };
}
