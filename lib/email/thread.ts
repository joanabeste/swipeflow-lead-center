// Thread-Logik: Subject normalisieren, Thread finden/anlegen, Lead-Match.
import { createServiceClient } from "@/lib/supabase/server";

export function normalizeSubject(subject: string | null | undefined): string {
  if (!subject) return "";
  return subject
    .replace(/^\s*(?:re|fw|fwd|aw|wg)\s*(?:\[\d+\])?\s*:\s*/gi, "")
    .replace(/^\s*(?:re|fw|fwd|aw|wg)\s*(?:\[\d+\])?\s*:\s*/gi, "")
    .trim()
    .toLowerCase();
}

export function uniqLowerEmails(addrs: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const a of addrs) {
    if (!a) continue;
    const cleaned = a.trim().toLowerCase();
    if (cleaned) set.add(cleaned);
  }
  return [...set];
}

/**
 * Findet einen passenden Thread oder legt einen neuen an.
 * Strategie: zuerst per Message-ID-Kette (`in_reply_to` / `references`), dann
 * Fallback per (subject_normalized, participants overlap).
 */
export async function findOrCreateThread(args: {
  userId: string;
  subject: string | null;
  inReplyTo: string | null;
  referencesIds: string[];
  participants: string[];
  receivedAt: Date;
}): Promise<{ threadId: string; isNew: boolean }> {
  const db = createServiceClient();

  // 1) Thread per Header-Verkettung suchen (egal welcher User).
  const idCandidates = [args.inReplyTo, ...args.referencesIds].filter(Boolean) as string[];
  if (idCandidates.length > 0) {
    const { data: linked } = await db
      .from("email_thread_messages")
      .select("thread_id")
      .in("message_id", idCandidates)
      .limit(1);
    if (linked && linked.length > 0) {
      return { threadId: linked[0].thread_id as string, isNew: false };
    }
  }

  // 2) Fallback: normalisiertes Subject + Participant-Overlap (letzte 90 Tage).
  const subjN = normalizeSubject(args.subject);
  if (subjN && args.participants.length > 0) {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: candidates } = await db
      .from("email_threads")
      .select("id, participants")
      .eq("subject_normalized", subjN)
      .gte("last_message_at", since)
      .limit(20);
    if (candidates) {
      for (const c of candidates) {
        const partsRaw = c.participants as string[] | null;
        const parts = (partsRaw ?? []).map((p) => p.toLowerCase());
        const overlap = args.participants.some((p) => parts.includes(p));
        if (overlap) return { threadId: c.id as string, isNew: false };
      }
    }
  }

  // 3) Neuen Thread anlegen.
  const { data: created, error } = await db
    .from("email_threads")
    .insert({
      subject_normalized: subjN || null,
      participants: args.participants,
      last_message_at: args.receivedAt.toISOString(),
      owner_user_id: args.userId,
    })
    .select("id")
    .single();
  if (error || !created) {
    throw new Error(`email_threads insert failed: ${error?.message ?? "unknown"}`);
  }
  return { threadId: created.id as string, isNew: true };
}

// Free-Mail-Provider — Domain-Match darf nicht auf gmail.com etc. greifen, weil
// das sonst beliebige Mails dem ersten Lead mit gmail.com-Adresse zuordnen würde.
const FREEMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com",
  "gmx.de", "gmx.net", "gmx.at", "gmx.ch", "gmx.com",
  "web.de", "freenet.de", "t-online.de",
  "yahoo.com", "yahoo.de", "ymail.com",
  "outlook.com", "outlook.de", "hotmail.com", "hotmail.de", "live.com", "live.de", "msn.com",
  "icloud.com", "me.com", "mac.com",
  "aol.com", "aol.de",
  "mail.de", "posteo.de", "posteo.net", "mailbox.org", "tutanota.com", "protonmail.com", "proton.me",
]);

export function extractDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at < 0) return null;
  const dom = email.slice(at + 1).trim().toLowerCase();
  return dom || null;
}

export function isFreemailDomain(domain: string | null): boolean {
  return !!domain && FREEMAIL_DOMAINS.has(domain);
}

/**
 * Sucht eine Lead-ID anhand der beteiligten Mail-Adressen.
 * Match-Reihenfolge: customer_contacts.email → leads.email → leads.domain (außer Freemail).
 */
export async function findLeadByParticipants(participants: string[]): Promise<string | null> {
  if (participants.length === 0) return null;
  const db = createServiceClient();

  const { data: contacts } = await db
    .from("customer_contacts")
    .select("lead_id, email")
    .in("email", participants)
    .limit(1);
  if (contacts && contacts.length > 0) return contacts[0].lead_id as string;

  const { data: leads } = await db
    .from("leads")
    .select("id, email")
    .in("email", participants)
    .limit(1);
  if (leads && leads.length > 0) return leads[0].id as string;

  // Domain-Fallback: aus den Beteiligten alle nicht-Freemail-Domains ziehen
  // und gegen leads.domain matchen. Bei Mehrdeutigkeit (mehrere Leads teilen
  // sich eine Domain) lieber nicht zuordnen.
  const domains = [...new Set(
    participants.map(extractDomain).filter((d): d is string => !!d && !isFreemailDomain(d)),
  )];
  if (domains.length === 0) return null;

  const { data: byDomain } = await db
    .from("leads")
    .select("id, domain")
    .in("domain", domains)
    .limit(5);
  if (!byDomain || byDomain.length === 0) return null;

  const byDom = new Map<string, string[]>();
  for (const row of byDomain) {
    const d = (row.domain as string | null)?.toLowerCase();
    if (!d) continue;
    const arr = byDom.get(d) ?? [];
    arr.push(row.id as string);
    byDom.set(d, arr);
  }
  for (const d of domains) {
    const ids = byDom.get(d);
    if (ids && ids.length === 1) return ids[0];
  }
  return null;
}

/** Schreibt aggregierte Felder am Thread fort (count, last_message_at, unread). */
export async function refreshThreadAggregates(threadId: string): Promise<void> {
  const db = createServiceClient();
  const { data: msgs } = await db
    .from("email_thread_messages")
    .select("received_at, is_read, direction, from_email, to_emails, cc_emails")
    .eq("thread_id", threadId);
  if (!msgs) return;

  const lastAt = msgs.reduce<string | null>((acc, m) => {
    const t = m.received_at as string;
    return !acc || t > acc ? t : acc;
  }, null);
  const unread = msgs.filter((m) => m.direction === "in" && !m.is_read).length;
  const participantSet = new Set<string>();
  for (const m of msgs) {
    if (m.from_email) participantSet.add((m.from_email as string).toLowerCase());
    for (const a of ((m.to_emails as string[] | null) ?? [])) participantSet.add(a.toLowerCase());
    for (const a of ((m.cc_emails as string[] | null) ?? [])) participantSet.add(a.toLowerCase());
  }

  await db
    .from("email_threads")
    .update({
      message_count: msgs.length,
      last_message_at: lastAt,
      unread_count: unread,
      participants: [...participantSet],
    })
    .eq("id", threadId);
}
