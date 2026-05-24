// Inkrementeller IMAP-Sync: INBOX + Sent → email_thread_messages.
// Wird lazy (bei Öffnen der Mail-UI) und per Cron (alle 5 Min) getriggert.

import { simpleParser, type AddressObject } from "mailparser";
import { createImapClient } from "./imap";
import {
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

const MAX_PER_FOLDER = 100; // Pro Run hartes Limit gegen Initial-Avalanche.
const INITIAL_BACKFILL_DAYS = 30;

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
}

async function syncFolder(client: ReturnType<typeof createImapClient>, args: FolderSyncArgs): Promise<{ count: number; maxUid: number | null }> {
  const lock = await client.getMailboxLock(args.folder);
  let maxUid: number | null = args.lastUid;
  let count = 0;
  const db = createServiceClient();
  const touchedThreads = new Set<string>();

  try {
    // UID-Search: alles > lastUid; beim ersten Run nur letzte N Tage als Backfill.
    let searchRange: string;
    if (args.lastUid && args.lastUid > 0) {
      searchRange = `${args.lastUid + 1}:*`;
    } else {
      // Initial: Backfill, server-seitig per SINCE filtern.
      const since = new Date(Date.now() - INITIAL_BACKFILL_DAYS * 24 * 60 * 60 * 1000);
      const uids = await client.search({ since }, { uid: true });
      if (!uids || uids.length === 0) {
        return { count: 0, maxUid: null };
      }
      const sorted = uids.sort((a, b) => a - b);
      const slice = sorted.slice(-MAX_PER_FOLDER);
      searchRange = `${slice[0]}:${slice[slice.length - 1]}`;
    }

    let processed = 0;
    for await (const msg of client.fetch(
      searchRange,
      { uid: true, source: true, envelope: true, internalDate: true },
      { uid: true },
    )) {
      if (processed >= MAX_PER_FOLDER) break;
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

        const attachments =
          parsed.attachments?.map((a) => ({
            filename: a.filename ?? null,
            contentType: a.contentType ?? null,
            size: a.size ?? null,
            contentId: a.contentId ?? null,
          })) ?? [];

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

  return { count, maxUid };
}

/**
 * Synchronisiert INBOX + Sent für einen User. Idempotent, inkrementell.
 */
export async function syncUserMailbox(userId: string): Promise<SyncResult | SyncError> {
  const config = await loadDecryptedImap(userId);
  if (!config) return { ok: false, error: "Keine IMAP-Zugangsdaten hinterlegt." };

  const cursor = await loadImapSyncCursor(userId);
  const client = createImapClient(config);

  try {
    await client.connect();

    const inbox = await syncFolder(client, {
      userId,
      folder: "INBOX",
      direction: "in",
      lastUid: cursor.lastUidInbox,
    });
    const sent = await syncFolder(client, {
      userId,
      folder: config.sentFolder,
      direction: "out",
      lastUid: cursor.lastUidSent,
    });

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
