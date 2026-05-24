"use server";

import { revalidatePath } from "next/cache";
import nodemailer from "nodemailer";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import { loadDecryptedImap, loadDecryptedSmtp } from "@/lib/email/user-credentials";
import {
  extractSignatureWithClaude,
  extractOwnSignatureFromSent,
  getUserSignature,
  saveUserSignature,
  shouldAttemptSignatureExtraction,
  upsertContactFromSignature,
} from "@/lib/email/signature";
import { syncUserMailbox, appendToSent } from "@/lib/email/sync";
import { loadMessages, markThreadRead, type MessageRow } from "@/lib/email/data";
import { getEmailAttachmentSignedUrl } from "@/lib/email/attachments";
import { generateMailDraft, type ComposeTone } from "@/lib/email/compose";
import { rejectSignatureContact } from "@/lib/email/signature";
import { requestDeepSync, setBackfillDays, getBackfillSettings } from "@/lib/email/user-credentials";
import {
  findOrCreateThread,
  findLeadByParticipants,
  refreshThreadAggregates,
  uniqLowerEmails,
} from "@/lib/email/thread";

type Result<T = unknown> = ({ success: true } & T) | { error: string };
type Ok = { success: true };

/**
 * Hängt die User-Signatur an den Body. Idempotent: wenn der Body bereits
 * (auf etwas Whitespace-Variationen genau) auf die Signatur endet, bleibt er
 * unverändert. Bei leerer Signatur wird nichts angehängt.
 */
function appendSignature(body: string, signature: string | null): string {
  if (!signature || !signature.trim()) return body;
  const sig = signature.replace(/\r\n/g, "\n").trim();
  const trimmedBody = body.replace(/\r\n/g, "\n").replace(/\s+$/, "");
  // Bereits enthalten? Vergleiche die letzten N Zeichen normalisiert.
  const tail = trimmedBody.slice(-Math.max(sig.length + 50, 200));
  if (normalizeWs(tail).includes(normalizeWs(sig))) return body;
  return `${trimmedBody}\n\n${sig}\n`;
}

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

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

export async function getAttachmentDownloadUrl(input: {
  messageId: string;
  attachmentIndex: number;
}): Promise<Result<{ url: string; filename: string | null; mime_type: string | null }>> {
  const user = await getUser();
  if (!user) return { error: "Nicht angemeldet." };
  const db = createServiceClient();
  const { data: row, error } = await db
    .from("email_thread_messages")
    .select("user_id, attachments")
    .eq("id", input.messageId)
    .maybeSingle();
  if (error || !row) return { error: "Nachricht nicht gefunden." };
  if (row.user_id !== user.id) return { error: "Kein Zugriff auf diesen Anhang." };
  const list = (row.attachments ?? []) as Array<{
    filename: string | null;
    contentType: string | null;
    storage_path?: string | null;
  }>;
  const att = list[input.attachmentIndex];
  if (!att) return { error: "Anhang nicht gefunden." };
  if (!att.storage_path) return { error: "Anhang nicht verfügbar (vor Update synchronisiert)." };
  const url = await getEmailAttachmentSignedUrl(att.storage_path);
  if (!url) return { error: "Download-URL konnte nicht erzeugt werden." };
  return { success: true, url, filename: att.filename, mime_type: att.contentType };
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

  // Signatur anhängen (idempotent: nicht doppeln, wenn der Body bereits darauf endet).
  const signature = await getUserSignature(args.userId);
  const bodyWithSig = appendSignature(args.body, signature);

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
      text: bodyWithSig,
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
    body_text: bodyWithSig,
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

// ─── Auto-Projekt-Vorschlag ─────────────────────────────────────────

export async function acceptThreadAutoProjectSuggestion(threadId: string): Promise<Ok | { error: string }> {
  const user = await getUser();
  if (!user) return { error: "Nicht angemeldet." };
  const db = createServiceClient();
  const { data: t } = await db
    .from("email_threads")
    .select("auto_project_id, lead_id")
    .eq("id", threadId)
    .maybeSingle();
  if (!t?.auto_project_id) return { error: "Kein Vorschlag vorhanden." };
  const { error } = await db
    .from("email_threads")
    .update({ project_id: t.auto_project_id })
    .eq("id", threadId);
  if (error) return { error: error.message };
  await logAudit({
    userId: user.id,
    action: "email.thread.auto_project_accepted",
    entityType: "email_thread",
    entityId: threadId,
    details: { project_id: t.auto_project_id },
  });
  if (t.lead_id) revalidatePath(`/fulfillment/kunden/${t.lead_id}`);
  return { success: true };
}

export async function rejectThreadAutoProjectSuggestion(threadId: string): Promise<Ok | { error: string }> {
  const user = await getUser();
  if (!user) return { error: "Nicht angemeldet." };
  const db = createServiceClient();
  const { data: t } = await db
    .from("email_threads")
    .select("lead_id")
    .eq("id", threadId)
    .maybeSingle();
  const { error } = await db
    .from("email_threads")
    .update({ auto_project_id: null, auto_project_rejected: true })
    .eq("id", threadId);
  if (error) return { error: error.message };
  if (t?.lead_id) revalidatePath(`/fulfillment/kunden/${t.lead_id}`);
  return { success: true };
}

// ─── Signatur-Settings ─────────────────────────────────────────────

export async function extractMySignatureAction(): Promise<Result<{ signature: string | null }>> {
  const user = await getUser();
  if (!user) return { error: "Nicht angemeldet." };
  const smtp = await loadDecryptedSmtp(user.id);
  if (!smtp) return { error: "Bitte zuerst SMTP konfigurieren." };
  const res = await extractOwnSignatureFromSent({ userId: user.id, fromEmail: smtp.fromEmail });
  if (res.error && !res.signature) return { error: res.error };
  revalidatePath("/mein-konto");
  return { success: true, signature: res.signature };
}

export async function saveSignatureAction(text: string): Promise<Ok | { error: string }> {
  const user = await getUser();
  if (!user) return { error: "Nicht angemeldet." };
  const res = await saveUserSignature(user.id, text, "manual");
  if (res.error) return { error: res.error };
  revalidatePath("/mein-konto");
  return { success: true };
}

// ─── Manuelle Telefonate ────────────────────────────────────────────

export async function addManualCall(input: {
  leadId: string;
  occurredAt: string; // ISO string mit Datum + Uhrzeit
  durationMinutes: number | null;
  direction: "inbound" | "outbound";
  notes: string | null;
  contactId?: string | null;
  phoneNumber?: string | null;
}): Promise<Result<{ callId: string }>> {
  const user = await getUser();
  if (!user) return { error: "Nicht angemeldet." };
  if (!input.leadId) return { error: "Lead fehlt." };
  if (!input.occurredAt) return { error: "Datum/Uhrzeit fehlt." };

  const occurred = new Date(input.occurredAt);
  if (Number.isNaN(occurred.getTime())) return { error: "Ungültiges Datum." };
  const occurredIso = occurred.toISOString();

  const db = createServiceClient();
  const { data, error } = await db
    .from("lead_calls")
    .insert({
      lead_id: input.leadId,
      contact_id: input.contactId ?? null,
      direction: input.direction,
      status: "ended",
      duration_seconds: input.durationMinutes != null ? Math.round(input.durationMinutes * 60) : null,
      notes: input.notes?.trim() || null,
      phone_number: input.phoneNumber ?? null,
      started_at: occurredIso,
      ended_at: occurredIso,
      call_provider: "manual",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) {
    return { error: `DB-Fehler: ${error.message}` };
  }

  await logAudit({
    userId: user.id,
    action: "lead.call_manual",
    entityType: "lead",
    entityId: input.leadId,
    details: {
      call_id: data.id,
      direction: input.direction,
      duration_minutes: input.durationMinutes,
      occurred_at: occurredIso,
    },
  });
  revalidatePath(`/fulfillment/kunden/${input.leadId}`);
  return { success: true, callId: data.id as string };
}

export async function updateManualCall(input: {
  callId: string;
  leadId: string;
  occurredAt: string;
  durationMinutes: number | null;
  direction: "inbound" | "outbound";
  notes: string | null;
}): Promise<Ok | { error: string }> {
  const user = await getUser();
  if (!user) return { error: "Nicht angemeldet." };
  const occurred = new Date(input.occurredAt);
  if (Number.isNaN(occurred.getTime())) return { error: "Ungültiges Datum." };
  const iso = occurred.toISOString();
  const db = createServiceClient();
  const { error } = await db
    .from("lead_calls")
    .update({
      direction: input.direction,
      duration_seconds: input.durationMinutes != null ? Math.round(input.durationMinutes * 60) : null,
      notes: input.notes?.trim() || null,
      started_at: iso,
      ended_at: iso,
    })
    .eq("id", input.callId);
  if (error) return { error: error.message };
  revalidatePath(`/fulfillment/kunden/${input.leadId}`);
  return { success: true };
}

export async function deleteCallEntry(callId: string, leadId: string): Promise<Ok | { error: string }> {
  const user = await getUser();
  if (!user) return { error: "Nicht angemeldet." };
  const db = createServiceClient();
  const { error } = await db.from("lead_calls").delete().eq("id", callId);
  if (error) return { error: error.message };
  await logAudit({
    userId: user.id,
    action: "lead.call_deleted",
    entityType: "lead",
    entityId: leadId,
    details: { call_id: callId },
  });
  revalidatePath(`/fulfillment/kunden/${leadId}`);
  return { success: true };
}

// ─── Notizen (Wrapper für die crm-Actions, mit Datum-Override) ─────

export async function addManualNote(input: {
  leadId: string;
  content: string;
  occurredAt?: string | null;
}): Promise<Result<{ noteId: string }>> {
  const user = await getUser();
  if (!user) return { error: "Nicht angemeldet." };
  if (!input.content?.trim()) return { error: "Notiz fehlt." };

  const db = createServiceClient();
  const payload: Record<string, unknown> = {
    lead_id: input.leadId,
    content: input.content.trim(),
    created_by: user.id,
  };
  if (input.occurredAt) {
    const d = new Date(input.occurredAt);
    if (Number.isNaN(d.getTime())) return { error: "Ungültiges Datum." };
    payload.created_at = d.toISOString();
  }
  const { data, error } = await db.from("lead_notes").insert(payload).select("id").single();
  if (error) return { error: `DB-Fehler: ${error.message}` };
  revalidatePath(`/fulfillment/kunden/${input.leadId}`);
  return { success: true, noteId: data.id as string };
}

export async function updateManualNote(input: {
  noteId: string;
  leadId: string;
  content: string;
  occurredAt?: string | null;
}): Promise<Ok | { error: string }> {
  const user = await getUser();
  if (!user) return { error: "Nicht angemeldet." };
  if (!input.content?.trim()) return { error: "Notiz fehlt." };
  const db = createServiceClient();
  const patch: Record<string, unknown> = {
    content: input.content.trim(),
    updated_at: new Date().toISOString(),
  };
  if (input.occurredAt) {
    const d = new Date(input.occurredAt);
    if (Number.isNaN(d.getTime())) return { error: "Ungültiges Datum." };
    patch.created_at = d.toISOString();
  }
  const { error } = await db.from("lead_notes").update(patch).eq("id", input.noteId);
  if (error) return { error: error.message };
  revalidatePath(`/fulfillment/kunden/${input.leadId}`);
  return { success: true };
}

export async function deleteNoteEntry(noteId: string, leadId: string): Promise<Ok | { error: string }> {
  const user = await getUser();
  if (!user) return { error: "Nicht angemeldet." };
  const db = createServiceClient();
  const { error } = await db.from("lead_notes").delete().eq("id", noteId);
  if (error) return { error: error.message };
  revalidatePath(`/fulfillment/kunden/${leadId}`);
  return { success: true };
}

// ─── Aktivitäten laden (Mails + Calls + Notes als gemergte Timeline) ─

export interface ActivityNote {
  kind: "note";
  id: string;
  content: string;
  occurred_at: string;
  created_by: string | null;
}
export interface ActivityCall {
  kind: "call";
  id: string;
  direction: "inbound" | "outbound";
  duration_seconds: number | null;
  notes: string | null;
  phone_number: string | null;
  occurred_at: string;
  call_provider: string;
}
export type ActivityItem = ActivityNote | ActivityCall;

export async function loadActivitiesForLead(leadId: string): Promise<ActivityItem[]> {
  const db = createServiceClient();
  const [notesRes, callsRes] = await Promise.all([
    db
      .from("lead_notes")
      .select("id, content, created_at, created_by")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(200),
    db
      .from("lead_calls")
      .select("id, direction, duration_seconds, notes, phone_number, started_at, call_provider")
      .eq("lead_id", leadId)
      .order("started_at", { ascending: false })
      .limit(200),
  ]);
  const notes: ActivityNote[] = (notesRes.data ?? []).map((n) => ({
    kind: "note",
    id: n.id as string,
    content: (n.content as string) ?? "",
    occurred_at: (n.created_at as string) ?? new Date().toISOString(),
    created_by: (n.created_by as string | null) ?? null,
  }));
  const calls: ActivityCall[] = (callsRes.data ?? []).map((c) => ({
    kind: "call",
    id: c.id as string,
    direction: ((c.direction as string) === "inbound" ? "inbound" : "outbound") as "inbound" | "outbound",
    duration_seconds: (c.duration_seconds as number | null) ?? null,
    notes: (c.notes as string | null) ?? null,
    phone_number: (c.phone_number as string | null) ?? null,
    occurred_at: (c.started_at as string) ?? new Date().toISOString(),
    call_provider: (c.call_provider as string) ?? "manual",
  }));
  return [...notes, ...calls].sort(
    (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  );
}

// ─── Backfill-Settings ──────────────────────────────────────────────

export async function setBackfillDaysAction(days: number): Promise<Ok | { error: string }> {
  const user = await getUser();
  if (!user) return { error: "Nicht angemeldet." };
  await setBackfillDays(user.id, days);
  revalidatePath("/mein-konto");
  return { success: true };
}

export async function requestDeepSyncAction(): Promise<Ok | { error: string }> {
  const user = await getUser();
  if (!user) return { error: "Nicht angemeldet." };
  await requestDeepSync(user.id);
  await logAudit({
    userId: user.id,
    action: "email.deep_sync_requested",
    entityType: "email_thread",
    details: {},
  });
  revalidatePath("/mein-konto");
  return { success: true };
}

export async function getBackfillSettingsAction(): Promise<Result<{ days: number; deepSyncPending: boolean }>> {
  const user = await getUser();
  if (!user) return { error: "Nicht angemeldet." };
  const s = await getBackfillSettings(user.id);
  return { success: true, days: s.days, deepSyncPending: !!s.deepSyncRequestedAt };
}

// ─── KI-Compose ─────────────────────────────────────────────────────

export async function composeMailDraft(input: {
  leadId: string;
  threadId?: string | null;
  recipient?: string | null;
  subject?: string | null;
  intent?: string | null;
  tone?: ComposeTone | null;
}): Promise<Result<{ subject: string; body: string }>> {
  const user = await getUser();
  if (!user) return { error: "Nicht angemeldet." };
  const smtp = await loadDecryptedSmtp(user.id);
  if (!smtp) return { error: "Bitte zuerst SMTP konfigurieren." };
  const res = await generateMailDraft({
    userId: user.id,
    fromEmail: smtp.fromEmail,
    leadId: input.leadId,
    threadId: input.threadId ?? null,
    recipient: input.recipient ?? null,
    subject: input.subject ?? null,
    intent: input.intent ?? null,
    tone: input.tone ?? null,
  });
  if (!res.ok) return { error: res.error };
  return { success: true, subject: res.draft.subject, body: res.draft.body };
}

// ─── Signatur-Reject ────────────────────────────────────────────────

export async function rejectExtractedContactAction(input: {
  leadId: string;
  email: string;
  contactId?: string | null;
}): Promise<Ok | { error: string }> {
  const user = await getUser();
  if (!user) return { error: "Nicht angemeldet." };
  const res = await rejectSignatureContact({
    leadId: input.leadId,
    email: input.email,
    userId: user.id,
  });
  if (res.error) return { error: res.error };
  // Wenn die contactId mitgegeben wurde, löschen wir den fälschlich angelegten Kontakt direkt.
  if (input.contactId) {
    const db = createServiceClient();
    await db.from("customer_contacts").delete().eq("id", input.contactId);
  }
  await logAudit({
    userId: user.id,
    action: "lead.contact_rejected",
    entityType: "lead",
    entityId: input.leadId,
    details: { email: input.email },
  });
  revalidatePath(`/fulfillment/kunden/${input.leadId}`);
  return { success: true };
}
