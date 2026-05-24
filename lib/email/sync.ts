// Inkrementeller IMAP-Sync: INBOX + Sent → email_thread_messages.
// Wird lazy (bei Öffnen der Mail-UI) und per Cron (alle 5 Min) getriggert.

import { simpleParser, type AddressObject } from "mailparser";
import { createImapClient } from "./imap";
import {
  clearDeepSyncMarker,
  getBackfillSettings,
  loadDecryptedImap,
  loadImapSyncCursor,
  updateImapSyncCursor,
} from "./user-credentials";
import {
  findLeadByParticipants,
  findOrCreateThread,
  refreshThreadAggregates,
  uniqLowerEmails,
} from "./thread";
import { createServiceClient } from "@/lib/supabase/server";
import { uploadEmailAttachment } from "./attachments";
import { extractSignatureWithClaude, isSignatureRejected, shouldAttemptSignatureExtraction, upsertContactFromSignature } from "./signature";
import { classifyThreadForProject } from "./classifier";

const MAX_PER_FOLDER_NORMAL = 100; // Pro Run hartes Limit gegen Initial-Avalanche.
const MAX_PER_FOLDER_DEEP = 2000;  // One-Shot Deep-Sync darf deutlich mehr.
const DEFAULT_BACKFILL_DAYS = 30;

export interface SyncResult {
  ok: true;
  inbox: number;
  sent: number;
}
export interface SyncError {
  ok: false;
  error: string;
}

function addrFirst(a: AddressObject | AddressObject[] | undefined): {
  email: string | null;
  name: string | null;
} {
  if (!a) return { email: null, name: null };
  const obj = Array.isArray(a) ? a[0] : a;
  const value = obj?.value?.[0];
  return {
    email: value?.address?.toLowerCase() ?? null,
    name: value?.name ?? null,
  };
}

function addrAll(a: AddressObject | AddressObject[] | undefined): string[] {
  if (!a) return [];
  const arr = Array.isArray(a) ? a : [a];
  const out: string[] = [];
  for (const obj of arr) {
    for (const v of obj?.value ?? []) {
      if (v.address) out.push(v.address.toLowerCase());
    }
  }
  return out;
}

interface FolderSyncArgs {
  userId: string;
  folder: string;
  direction: "in" | "out";
  lastUid: number | null;
  backfillDays: number; // 0 = unbegrenzt
  deepMode: boolean;
}

async function syncFolder(client: ReturnType<typeof createImapClient>, args: FolderSyncArgs): Promise<{ count: number; maxUid: number | null }> {
  const lock = await client.getMailboxLock(args.folder);
  let maxUid: number | null = args.lastUid;
  let count = 0;
  const db = createServiceClient();
  const touchedThreads = new Set<string>();
  const maxPerFolder = args.deepMode ? MAX_PER_FOLDER_DEEP : MAX_PER_FOLDER_NORMAL;

  try {
    // UID-Search: alles > lastUid; beim ersten Run / Deep-Sync per SINCE filtern.
    let searchRange: string;
    if (!args.deepMode && args.lastUid && args.lastUid > 0) {
      searchRange = `${args.lastUid + 1}:*`;
    } else {
      // Backfill: server-seitig per SINCE filtern. days=0 → kein SINCE = alles.
      const days = args.backfillDays > 0 ? args.backfillDays : null;
      const searchCriteria: Record<string, unknown> = {};
      if (days !== null) {
        searchCriteria.since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      } else {
        // ALL: imapflow akzeptiert leeres Object nicht überall — wir nutzen ein
        // sehr weit zurückreichendes SINCE als Fallback (Anfang 2000).
        searchCriteria.since = new Date("2000-01-01T00:00:00Z");
      }
      const uids = await client.search(searchCriteria, { uid: true });
      if (!uids || uids.length === 0) {
        return { count: 0, maxUid: null };
      }
      const sorted = uids.sort((a, b) => a - b);
      const slice = sorted.slice(-maxPerFolder);
      searchRange = `${slice[0]}:${slice[slice.length - 1]}`;
    }

    let processed = 0;
    for await (const msg of client.fetch(
      searchRange,
      { uid: true, source: true, envelope: true, internalDate: true },
      { uid: true },
    )) {
      if (processed >= maxPerFolder) break;
      processed += 1;
      if (!msg.source) continue;

      try {
        const parsed = await simpleParser(msg.source as Buffer);

        const fromObj = addrFirst(parsed.from);
        const toEmails = addrAll(parsed.to);
        const ccEmails = addrAll(parsed.cc);
        const messageId = parsed.messageId ?? null;
        const inReplyTo = parsed.inReplyTo ?? null;
        const referencesIds = Array.isArray(parsed.references)
          ? parsed.references
          : parsed.references
          ? [parsed.references]
          : [];

        // Dedup: bei vorhandener message_id für diesen User skippen.
        if (messageId) {
          const { data: existing } = await db
            .from("email_thread_messages")
            .select("id")
            .eq("user_id", args.userId)
            .eq("message_id", messageId)
            .maybeSingle();
          if (existing) {
            if (typeof msg.uid === "number" && (maxUid === null || msg.uid > maxUid)) {
              maxUid = msg.uid;
            }
            continue;
          }
        }

        const participants = uniqLowerEmails([fromObj.email, ...toEmails, ...ccEmails]);
        const rawReceived = parsed.date ?? msg.internalDate ?? new Date();
        const receivedAt = rawReceived instanceof Date ? rawReceived : new Date(rawReceived);

        const { threadId } = await findOrCreateThread({
          userId: args.userId,
          subject: parsed.subject ?? null,
          inReplyTo,
          referencesIds,
          participants,
          receivedAt,
        });

        // Lead-Zuordnung am Thread (nur wenn noch nicht gesetzt).
        const { data: threadRow } = await db
          .from("email_threads")
          .select("lead_id")
          .eq("id", threadId)
          .maybeSingle();
        if (threadRow && !threadRow.lead_id) {
          const leadId = await findLeadByParticipants(participants);
          if (leadId) {
            await db.from("email_threads").update({ lead_id: leadId }).eq("id", threadId);
          }
        }

        const attachments: Array<{
          filename: string | null;
          contentType: string | null;
          size: number | null;
          contentId: string | null;
          storage_path: string | null;
          upload_error: string | null;
        }> = [];
        if (parsed.attachments && parsed.attachments.length > 0) {
          for (let i = 0; i < parsed.attachments.length; i++) {
            const a = parsed.attachments[i];
            const buf = a.content as Buffer | undefined;
            let uploaded: { storage_path: string | null; upload_error: string | null } = {
              storage_path: null,
              upload_error: null,
            };
            if (buf && Buffer.isBuffer(buf) && buf.length > 0) {
              uploaded = await uploadEmailAttachment({
                userId: args.userId,
                threadId,
                imapUid: msg.uid,
                index: i,
                filename: a.filename ?? `anhang-${i}`,
                buffer: buf,
                mimeType: a.contentType ?? null,
              });
            } else {
              uploaded.upload_error = "Keine Binärdaten im Parser-Output.";
            }
            attachments.push({
              filename: a.filename ?? null,
              contentType: a.contentType ?? null,
              size: a.size ?? null,
              contentId: a.contentId ?? null,
              storage_path: uploaded.storage_path,
              upload_error: uploaded.upload_error,
            });
          }
        }

        const { error: insertErr } = await db.from("email_thread_messages").insert({
          thread_id: threadId,
          user_id: args.userId,
          direction: args.direction,
          message_id: messageId,
          in_reply_to: inReplyTo,
          references_ids: referencesIds,
          from_email: fromObj.email,
          from_name: fromObj.name,
          to_emails: toEmails,
          cc_emails: ccEmails,
          subject: parsed.subject ?? null,
          body_text: parsed.text ?? null,
          body_html: parsed.html || null,
          attachments,
          imap_uid: msg.uid,
          imap_folder: args.folder,
          received_at: receivedAt.toISOString(),
          is_read: args.direction === "out",
        });
        if (insertErr) {
          // Wahrscheinlichster Fall: parallele Dedup-Kollision → ignorieren.
          if (!/duplicate key|unique constraint/i.test(insertErr.message)) {
            throw insertErr;
          }
        } else {
          count += 1;
          touchedThreads.add(threadId);
        }

        if (typeof msg.uid === "number" && (maxUid === null || msg.uid > maxUid)) {
          maxUid = msg.uid;
        }
      } catch (perMsgErr) {
        // Eine kaputte Mail darf den Sync nicht abbrechen.
        console.error(`[email-sync] msg parse failed (uid=${msg.uid}):`, perMsgErr);
      }
    }
  } finally {
    lock.release();
  }

  for (const tid of touchedThreads) {
    await refreshThreadAggregates(tid);
  }

  // Best-effort Enrichment: Signatur-Extraktion + Auto-Projekt-Klassifizierung.
  // Läuft asynchron pro Thread; Fehler werden geloggt, brechen den Sync nicht ab.
  if (touchedThreads.size > 0) {
    await enrichTouchedThreads({ userId: args.userId, threadIds: [...touchedThreads] });
  }

  return { count, maxUid };
}

async function enrichTouchedThreads(args: { userId: string; threadIds: string[] }): Promise<void> {
  const db = createServiceClient();

  // Threads mit Lead-Match laden — nur die sind interessant für Klassifizierung.
  const { data: threads } = await db
    .from("email_threads")
    .select("id, lead_id, owner_user_id")
    .in("id", args.threadIds);
  const withLead = (threads ?? []).filter((t) => t.lead_id);

  // Owner-Email für Signatur-Skip ermitteln (eigene Mails nicht durchsuchen).
  let ownerEmail: string | null = null;
  try {
    const { loadDecryptedImap } = await import("./user-credentials");
    const imap = await loadDecryptedImap(args.userId);
    if (imap?.username?.includes("@")) ownerEmail = imap.username.toLowerCase();
  } catch {
    // ignore
  }

  for (const t of withLead) {
    const threadId = t.id as string;
    const leadId = t.lead_id as string;

    // 1) Signatur-Extraktion: neueste eingehende Mail des Threads.
    try {
      const { data: lastIn } = await db
        .from("email_thread_messages")
        .select("from_email, from_name, body_text")
        .eq("thread_id", threadId)
        .eq("direction", "in")
        .not("body_text", "is", null)
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastIn?.from_email) {
        const fromEmail = lastIn.from_email as string;
        if (shouldAttemptSignatureExtraction({ fromEmail, ownerEmail })) {
          const rejected = await isSignatureRejected(leadId, fromEmail);
          // Skip, wenn Kontakt bereits existiert oder vom User abgelehnt wurde (spart LLM-Call).
          const { data: existing } = await db
            .from("customer_contacts")
            .select("id")
            .eq("lead_id", leadId)
            .eq("email", fromEmail.toLowerCase())
            .maybeSingle();
          if (!existing && !rejected) {
            const extracted = await extractSignatureWithClaude({
              body: (lastIn.body_text as string | null) ?? "",
              fromName: (lastIn.from_name as string | null) ?? null,
              fromEmail,
            });
            if (extracted) {
              await upsertContactFromSignature({
                leadId,
                email: fromEmail,
                fromName: (lastIn.from_name as string | null) ?? null,
                extracted,
              });
            }
          }
        }
      }
    } catch (e) {
      console.error("[sync:enrich:signature]", threadId, e);
    }

    // 2) Auto-Projekt-Klassifizierung.
    try {
      await classifyThreadForProject({ threadId, leadId });
    } catch (e) {
      console.error("[sync:enrich:classify]", threadId, e);
    }
  }
}

/**
 * Synchronisiert INBOX + Sent für einen User. Idempotent, inkrementell.
 */
export async function syncUserMailbox(userId: string): Promise<SyncResult | SyncError> {
  const config = await loadDecryptedImap(userId);
  if (!config) return { ok: false, error: "Keine IMAP-Zugangsdaten hinterlegt." };

  const [cursor, backfill] = await Promise.all([
    loadImapSyncCursor(userId),
    getBackfillSettings(userId),
  ]);
  const deepMode = !!backfill.deepSyncRequestedAt;
  const client = createImapClient(config);

  try {
    await client.connect();

    const inbox = await syncFolder(client, {
      userId,
      folder: "INBOX",
      direction: "in",
      lastUid: cursor.lastUidInbox,
      backfillDays: backfill.days ?? DEFAULT_BACKFILL_DAYS,
      deepMode,
    });
    const sent = await syncFolder(client, {
      userId,
      folder: config.sentFolder,
      direction: "out",
      lastUid: cursor.lastUidSent,
      backfillDays: backfill.days ?? DEFAULT_BACKFILL_DAYS,
      deepMode,
    });

    if (deepMode) {
      await clearDeepSyncMarker(userId);
    }

    await client.logout();

    await updateImapSyncCursor(
      userId,
      {
        lastUidInbox: inbox.maxUid ?? cursor.lastUidInbox,
        lastUidSent: sent.maxUid ?? cursor.lastUidSent,
      },
      null,
    );

    return { ok: true, inbox: inbox.count, sent: sent.count };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      await client.close();
    } catch {
      // ignore
    }
    await updateImapSyncCursor(userId, {}, msg);
    return { ok: false, error: msg };
  }
}

/**
 * Hängt eine gerade gesendete Mail in den IMAP-Sent-Ordner (damit Thunderbird
 * sie sieht). raw = RFC822-Bytes aus nodemailer.
 */
export async function appendToSent(userId: string, raw: Buffer | string): Promise<{ ok: true; uid?: number } | { ok: false; error: string }> {
  const config = await loadDecryptedImap(userId);
  if (!config) return { ok: false, error: "Keine IMAP-Zugangsdaten." };
  const client = createImapClient(config);
  try {
    await client.connect();
    const result = await client.append(config.sentFolder, raw, ["\\Seen"]);
    await client.logout();
    return { ok: true, uid: result && typeof result === "object" ? result.uid : undefined };
  } catch (e) {
    try {
      await client.close();
    } catch {
      // ignore
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
