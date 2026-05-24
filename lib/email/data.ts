// Server-Loader für Mail-Threads und -Messages.
import { createServiceClient } from "@/lib/supabase/server";

export interface ThreadRow {
  id: string;
  lead_id: string | null;
  subject_normalized: string | null;
  participants: string[];
  message_count: number;
  last_message_at: string | null;
  unread_count: number;
}

export interface MessageRow {
  id: string;
  thread_id: string;
  direction: "in" | "out";
  message_id: string | null;
  from_email: string | null;
  from_name: string | null;
  to_emails: string[] | null;
  cc_emails: string[] | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  attachments: Array<{ filename: string | null; contentType: string | null; size: number | null }> | null;
  received_at: string;
  is_read: boolean;
}

export async function loadThreadsForLead(leadId: string): Promise<ThreadRow[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("email_threads")
    .select("id, lead_id, subject_normalized, participants, message_count, last_message_at, unread_count")
    .eq("lead_id", leadId)
    .order("last_message_at", { ascending: false });
  return (data ?? []) as ThreadRow[];
}

export async function loadAllThreads(filter: "all" | "unread" | "unassigned" = "all"): Promise<ThreadRow[]> {
  const db = createServiceClient();
  let query = db
    .from("email_threads")
    .select("id, lead_id, subject_normalized, participants, message_count, last_message_at, unread_count")
    .order("last_message_at", { ascending: false })
    .limit(200);
  if (filter === "unread") query = query.gt("unread_count", 0);
  if (filter === "unassigned") query = query.is("lead_id", null);
  const { data } = await query;
  return (data ?? []) as ThreadRow[];
}

export async function loadMessages(threadId: string): Promise<MessageRow[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("email_thread_messages")
    .select("id, thread_id, direction, message_id, from_email, from_name, to_emails, cc_emails, subject, body_text, body_html, attachments, received_at, is_read")
    .eq("thread_id", threadId)
    .order("received_at", { ascending: true });
  return (data ?? []) as MessageRow[];
}

export async function markThreadRead(threadId: string): Promise<void> {
  const db = createServiceClient();
  await db
    .from("email_thread_messages")
    .update({ is_read: true })
    .eq("thread_id", threadId)
    .eq("direction", "in")
    .eq("is_read", false);
  await db.from("email_threads").update({ unread_count: 0 }).eq("id", threadId);
}
