"use server";

import { revalidatePath } from "next/cache";
import nodemailer from "nodemailer";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import { loadDecryptedImap, loadDecryptedSmtp } from "@/lib/email/user-credentials";
import {
  extractSignatureWithClaude,
  shouldAttemptSignatureExtraction,
  upsertContactFromSignature,
} from "@/lib/email/signature";
import { syncUserMailbox, appendToSent } from "@/lib/email/sync";
import { loadMessages, markThreadRead, type MessageRow } from "@/lib/email/data";
import {
  findOrCreateThread,
  findLeadByParticipants,
  refreshThreadAggregates,
  uniqLowerEmails,
} from "@/lib/email/thread";

type Result<T = unknown> = ({ success: true } & T) | { error: string };
type Ok = { success: true };

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function syncMyMailbox(): Promise<Result<{ inbox: number; sent: number }>> {
  const user = await getUser();
  if (!user) return { error: "Nicht angemeldet." };
  const res = await syncUserMailbox(user.id);
  if (!res.ok) return { error: res.error };
  return { success: true, inbox: res.inbox, sent: res.sent };
}

export async function loadThreadMessages(threadId: string): Promise<Result<{ messages: MessageRow[] }>> {
  const user = await getUser();
  if (!user) return { error: "Nicht angemeldet." };
  const messages = await loadMessages(threadId);
  return { success: true, messages };
}

export async function markRead(threadId: string): Promise<Ok | { error: string }> {
  const user = await getUser();
  if (!user) return { error: "Nicht angemeldet." };
  await markThreadRead(threadId);
  return { success: true };
}

export async function attachThreadToLead(input: { threadId: string; leadId: string }): Promise<Ok | { error: string }> {
  const user = await getUser();
  if (!user) return { error: "Nicht angemeldet." };
  const db = createServiceClient();
  const { error } = await db
    .from("email_threads")
    .update({ lead_id: input.leadId })
    .eq("id", input.threadId);
  if (error) return { error: error.message };
  await logAudit({
    userId: user.id, action: "email.thread.attach",
    entityType: "email_thread", entityId: input.threadId,
    details: { lead_id: input.leadId },
  });
  revalidatePath(`/fulfillment/kunden/${input.leadId}`);
  return { success: true };
}

/** Ordnet einen Mail-Thread einem konkreten Projekt zu (oder loest die Zuordnung mit projectId=null). */
export async function assignThreadToProject(input: { threadId: string; projectId: string | null }): Promise<Ok | { error: string }> {
  const user = await getUser();
  if (!user) return { error: "Nicht angemeldet." };
  const db = createServiceClient();

  // Wenn Projekt gesetzt: lead_id des Threads passend zur project.lead_id setzen,
  // damit der Thread auf der richtigen Kunden-Seite erscheint.
  let leadIdUpdate: string | null | undefined = undefined;
  if (input.projectId) {
    const { data: project, error: projErr } = await db
      .from("projects")
      .select("lead_id")
      .eq("id", input.projectId)
      .maybeSingle();
    if (projErr) return { error: projErr.message };
    if (!project) return { error: "Projekt nicht gefunden." };
    leadIdUpdate = project.lead_id as string;
  }

  const patch: Record<string, unknown> = { project_id: input.projectId };
  if (leadIdUpdate !== undefined) patch.lead_id = leadIdUpdate;

  const { error } = await db.from("email_threads").update(patch).eq("id", input.threadId);
  if (error) {
    if (/column.*project_id.*does not exist/i.test(error.message)) {
      return { error: "Spalte email_threads.project_id fehlt — Migration 084 muss ausgefuehrt werden." };
    }
    return { error: error.message };
  }

  await logAudit({
    userId: user.id, action: "email.thread.assign_project",
    entityType: "email_thread", entityId: input.threadId,
    details: { project_id: input.projectId },
  });
  if (input.projectId) revalidatePath(`/fulfillment/projekte/${input.projectId}`);
  if (leadIdUpdate) revalidatePath(`/fulfillment/kunden/${leadIdUpdate}`);
  return { success: true };
}

async function sendMailViaSmtpAndStore(args: {
  userId: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo: string | null;
  references: string[];
  leadIdHint: string | null;
}): Promise<Result<{ messageId: string; threadId: string }>> {
  const smtp = await loadDecryptedSmtp(args.userId);
  if (!smtp) return { error: "Keine SMTP-Zugangsdaten hinterlegt." };

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.username, pass: smtp.password },
  });

  const headers: Record<string, string> = {};
  if (args.inReplyTo) headers["In-Reply-To"] = args.inReplyTo;
  if (args.references.length > 0) headers["References"] = args.references.join(" ");

  let info: { messageId: string; raw?: Buffer | string };
  try {
    info = await transporter.sendMail({
      from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
      to: args.to,
      subject: args.subject,
      text: args.body,
      headers,
      messageId: undefined, // nodemailer generiert
    });
    transporter.close();
  } catch (e) {
    transporter.close();
    return { error: e instanceof Error ? e.message : String(e) };
  }

  // Raw-MIME nochmal aufbauen für IMAP-Append (separater Compose ohne send).
  const rawTransport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const built = await rawTransport.sendMail({
    from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
    to: args.to,
    subject: args.subject,
    text: args.body,
    headers: { ...headers, "Message-ID": info.messageId },
  });
  const raw: Buffer = Buffer.isBuffer(built.message) ? built.message : Buffer.from(String(built.message));

  // In IMAP-Sent appenden (best effort).
  void appendToSent(args.userId, raw).then((res) => {
    if (!res.ok) console.error("[mail] IMAP append failed:", res.error);
  });

  // Lokal sofort in DB ablegen.
  const db = createServiceClient();
  const participants = uniqLowerEmails([smtp.fromEmail, args.to]);
  const now = new Date();
  const { threadId } = await findOrCreateThread({
    userId: args.userId,
    subject: args.subject,
    inReplyTo: args.inReplyTo,
    referencesIds: args.references,
    participants,
    receivedAt: now,
  });

  // Lead-Zuordnung falls noch keine
  if (args.leadIdHint) {
    await db
      .from("email_threads")
      .update({ lead_id: args.leadIdHint })
      .eq("id", threadId)
      .is("lead_id", null);
  } else {
    const { data: t } = await db.from("email_threads").select("lead_id").eq("id", threadId).maybeSingle();
    if (t && !t.lead_id) {
      const leadId = await findLeadByParticipants(participants);
      if (leadId) await db.from("email_threads").update({ lead_id: leadId }).eq("id", threadId);
    }
  }

  await db.from("email_thread_messages").insert({
    thread_id: threadId,
    user_id: args.userId,
    direction: "out",
    message_id: info.messageId,
    in_reply_to: args.inReplyTo,
    references_ids: args.references,
    from_email: smtp.fromEmail.toLowerCase(),
    from_name: smtp.fromName,
    to_emails: [args.to.toLowerCase()],
    cc_emails: [],
    subject: args.subject,
    body_text: args.body,
    body_html: null,
    attachments: [],
    received_at: now.toISOString(),
    is_read: true,
  });

  await refreshThreadAggregates(threadId);

  return { success: true, messageId: info.messageId, threadId };
}

export async function sendNewMail(input: {
  leadId: string | null;
  to: string;
  subject: string;
  body: string;
}): Promise<Result<{ threadId: string }>> {
  const user = await getUser();
  if (!user) return { error: "Nicht angemeldet." };
  const to = input.to.trim();
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!to) return { error: "Empfänger fehlt." };
  if (!subject) return { error: "Betreff fehlt." };
  if (!body) return { error: "Nachricht fehlt." };

  const res = await sendMailViaSmtpAndStore({
    userId: user.id,
    to,
    subject,
    body,
    inReplyTo: null,
    references: [],
    leadIdHint: input.leadId,
  });
  if ("error" in res) return res;

  await logAudit({
    userId: user.id, action: "email.sent",
    entityType: "email_thread", entityId: res.threadId,
    details: { to, subject, lead_id: input.leadId },
  });
  if (input.leadId) revalidatePath(`/fulfillment/kunden/${input.leadId}`);
  return { success: true, threadId: res.threadId };
}

export async function sendReply(input: { threadId: string; body: string }): Promise<Result<{ messageId: string }>> {
  const user = await getUser();
  if (!user) return { error: "Nicht angemeldet." };
  const body = input.body.trim();
  if (!body) return { error: "Nachricht fehlt." };

  const db = createServiceClient();
  const { data: thread } = await db
    .from("email_threads")
    .select("id, subject_normalized, lead_id")
    .eq("id", input.threadId)
    .maybeSingle();
  if (!thread) return { error: "Thread nicht gefunden." };

  // Letzte eingehende Nachricht des Threads holen für Re:-Subject und Reply-Header.
  const { data: last } = await db
    .from("email_thread_messages")
    .select("message_id, references_ids, subject, from_email, to_emails, cc_emails")
    .eq("thread_id", input.threadId)
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const subjectBase = last?.subject || thread.subject_normalized || "";
  const subject = subjectBase
    ? /^re:/i.test(subjectBase) ? subjectBase : `Re: ${subjectBase}`
    : "Re: (kein Betreff)";

  // Empfänger: Absender der letzten Nachricht; Fallback auf erste to-Adresse.
  const to = (last?.from_email as string | undefined)
    || ((last?.to_emails as string[] | undefined) ?? [])[0]
    || "";
  if (!to) return { error: "Kein Empfänger im Thread gefunden." };

  const references: string[] = [];
  if (Array.isArray(last?.references_ids)) references.push(...(last!.references_ids as string[]));
  if (last?.message_id) references.push(last.message_id as string);

  const res = await sendMailViaSmtpAndStore({
    userId: user.id,
    to,
    subject,
    body,
    inReplyTo: (last?.message_id as string | undefined) ?? null,
    references,
    leadIdHint: (thread.lead_id as string | null) ?? null,
  });
  if ("error" in res) return res;

  await logAudit({
    userId: user.id, action: "email.replied",
    entityType: "email_thread", entityId: input.threadId,
    details: { to, subject },
  });

  if (thread.lead_id) revalidatePath(`/fulfillment/kunden/${thread.lead_id}`);
  return { success: true, messageId: res.messageId };
}

/**
 * Läuft alle Threads ohne lead_id durch und versucht erneut, einen Lead per
 * Participants/Domain zuzuordnen. Nutzt das Domain-Matching aus thread.ts.
 */
export async function rematchUnassignedThreads(): Promise<Result<{ scanned: number; matched: number }>> {
  const user = await getUser();
  if (!user) return { error: "Nicht angemeldet." };
  const db = createServiceClient();
  const { data: threads, error } = await db
    .from("email_threads")
    .select("id, participants")
    .is("lead_id", null)
    .limit(500);
  if (error) return { error: error.message };

  let matched = 0;
  for (const t of threads ?? []) {
    const parts = ((t.participants as string[] | null) ?? []).map((p) => p.toLowerCase());
    if (parts.length === 0) continue;
    const leadId = await findLeadByParticipants(parts);
    if (!leadId) continue;
    const { error: updErr } = await db
      .from("email_threads")
      .update({ lead_id: leadId })
      .eq("id", t.id as string);
    if (!updErr) matched += 1;
  }

  await logAudit({
    userId: user.id,
    action: "email.rematch_unassigned",
    entityType: "email_thread",
    details: { scanned: threads?.length ?? 0, matched },
  });
  revalidatePath("/fulfillment/inbox");
  return { success: true, scanned: threads?.length ?? 0, matched };
}

/**
 * Backfill: durchsucht eingehende Nachrichten in Threads mit Lead-Match,
 * deren Absender noch nicht als Kontakt existiert, und legt via Claude
 * extrahierte Signaturen als customer_contacts an.
 *
 * limit begrenzt die Anzahl der bearbeiteten Mails (LLM-Cost-Schutz).
 */
export async function backfillSignaturesForExistingMails(limit = 100): Promise<Result<{ scanned: number; created: number }>> {
  const user = await getUser();
  if (!user) return { error: "Nicht angemeldet." };
  const db = createServiceClient();

  const imap = await loadDecryptedImap(user.id);
  const ownerEmail = imap?.username?.includes("@") ? imap.username.toLowerCase() : null;

  // Eingehende Mails mit Lead-Match, neueste zuerst — die wichtigsten zuerst.
  const { data: msgs, error } = await db
    .from("email_thread_messages")
    .select("id, thread_id, from_email, from_name, body_text, email_threads!inner(lead_id)")
    .eq("direction", "in")
    .not("from_email", "is", null)
    .order("received_at", { ascending: false })
    .limit(Math.max(1, Math.min(500, limit)));
  if (error) return { error: error.message };

  let created = 0;
  const seenPairs = new Set<string>();

  for (const m of msgs ?? []) {
    const threadJoin = m.email_threads as { lead_id: string | null } | { lead_id: string | null }[] | null;
    const leadId = Array.isArray(threadJoin) ? threadJoin[0]?.lead_id : threadJoin?.lead_id;
    if (!leadId) continue;
    const fromEmail = (m.from_email as string | null)?.toLowerCase() ?? null;
    if (!fromEmail) continue;
    if (!shouldAttemptSignatureExtraction({ fromEmail, ownerEmail })) continue;

    const pair = `${leadId}|${fromEmail}`;
    if (seenPairs.has(pair)) continue;
    seenPairs.add(pair);

    const { data: existing } = await db
      .from("customer_contacts")
      .select("id")
      .eq("lead_id", leadId)
      .eq("email", fromEmail)
      .maybeSingle();
    if (existing) continue;

    const body = ((m.body_text as string | null) ?? "").toString();
    if (body.trim().length < 10) continue;

    const fromName = (m.from_name as string | null) ?? null;
    const extracted = await extractSignatureWithClaude({ body, fromName, fromEmail });
    if (!extracted) continue;

    const res = await upsertContactFromSignature({ leadId, email: fromEmail, fromName, extracted });
    if (res.created) created += 1;
  }

  await logAudit({
    userId: user.id,
    action: "email.backfill_signatures",
    entityType: "email_thread_message",
    details: { scanned: msgs?.length ?? 0, created, limit },
  });
  revalidatePath("/fulfillment/inbox");
  return { success: true, scanned: msgs?.length ?? 0, created };
}
