// Server-Loader für Mail-Threads und -Messages.
import { createClient, createServiceClient } from "@/lib/supabase/server";

export interface ThreadRow {
  id: string;
  lead_id: string | null;
  project_id: string | null;
  owner_user_id: string | null;
  subject_normalized: string | null;
  participants: string[];
  message_count: number;
  last_message_at: string | null;
  unread_count: number;
  /** Optional vom Server angereichert — Projekt-Name fuer Anzeige. */
  project_name?: string | null;
}

/** Aktueller User — null wenn nicht angemeldet (bei Cron z.B.). */
async function currentUid(): Promise<string | null> {
  try {
    const sb = await createClient();
    const { data } = await sb.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Visibility-Filter: nur Threads mit Projekt-Zuordnung ODER eigene. */
function applyVisibility<T extends { project_id: string | null; owner_user_id: string | null }>(
  rows: T[], userId: string | null,
): T[] {
  if (!userId) return rows.filter((r) => r.project_id !== null);
  return rows.filter((r) => r.project_id !== null || r.owner_user_id === userId);
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
    .select("id, lead_id, project_id, owner_user_id, subject_normalized, participants, message_count, last_message_at, unread_count")
    .eq("lead_id", leadId)
    .order("last_message_at", { ascending: false });
  const uid = await currentUid();
  return applyVisibility((data ?? []) as ThreadRow[], uid);
}

export async function loadAllThreads(filter: "all" | "unread" | "unassigned" = "all"): Promise<ThreadRow[]> {
  const db = createServiceClient();
  let query = db
    .from("email_threads")
    .select("id, lead_id, project_id, owner_user_id, subject_normalized, participants, message_count, last_message_at, unread_count")
    .order("last_message_at", { ascending: false })
    .limit(200);
  if (filter === "unread") query = query.gt("unread_count", 0);
  if (filter === "unassigned") query = query.is("lead_id", null);
  const { data } = await query;
  const uid = await currentUid();
  return applyVisibility((data ?? []) as ThreadRow[], uid);
}

export async function loadThreadsForProject(projectId: string): Promise<ThreadRow[]> {
  // Projekt-zugeordnete Threads sind per Definition fuer alle sichtbar — kein Owner-Filter noetig.
  const db = createServiceClient();
  const { data } = await db
    .from("email_threads")
    .select("id, lead_id, project_id, owner_user_id, subject_normalized, participants, message_count, last_message_at, unread_count")
    .eq("project_id", projectId)
    .order("last_message_at", { ascending: false });
  return (data ?? []) as ThreadRow[];
}

/** Threads die noch keinem Lead zugeordnet sind, aber Participant-Match haben. */
export async function loadSuggestedThreadsForEmails(emails: string[]): Promise<ThreadRow[]> {
  const cleaned = emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (cleaned.length === 0) return [];
  const db = createServiceClient();
  const { data } = await db
    .from("email_threads")
    .select("id, lead_id, project_id, owner_user_id, subject_normalized, participants, message_count, last_message_at, unread_count")
    .is("lead_id", null)
    .overlaps("participants", cleaned)
    .order("last_message_at", { ascending: false })
    .limit(50);
  const uid = await currentUid();
  return applyVisibility((data ?? []) as ThreadRow[], uid);
}

/** Erweitert eine Thread-Liste um den Projekt-Namen (fuer Anzeige im Mails-Tab). */
export async function enrichThreadsWithProjects(threads: ThreadRow[]): Promise<ThreadRow[]> {
  const projectIds = Array.from(new Set(threads.map((t) => t.project_id).filter((x): x is string => !!x)));
  if (projectIds.length === 0) return threads;
  const db = createServiceClient();
  const { data: projects } = await db.from("projects").select("id, name").in("id", projectIds);
  const nameById = new Map((projects ?? []).map((p) => [p.id as string, p.name as string]));
  return threads.map((t) => ({ ...t, project_name: t.project_id ? nameById.get(t.project_id) ?? null : null }));
}

export async function loadMessages(threadId: string): Promise<MessageRow[]> {
  const db = createServiceClient();
  // Sichtbarkeit pruefen: Thread muss entweder eigener oder Projekt-zugeordnet sein.
  const { data: thread } = await db
    .from("email_threads")
    .select("project_id, owner_user_id")
    .eq("id", threadId)
    .maybeSingle();
  if (!thread) return [];
  const uid = await currentUid();
  const visible = thread.project_id !== null || (uid !== null && thread.owner_user_id === uid);
  if (!visible) return [];

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
