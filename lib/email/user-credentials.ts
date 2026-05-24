import { createServiceClient } from "@/lib/supabase/server";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secrets";
import type { SmtpConfig } from "./smtp";

export interface UserSmtpRecord {
  userId: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromName: string;
  fromEmail: string;
  verifiedAt: string | null;
  lastTestError: string | null;
  updatedAt: string;
}

/** Lädt Metadaten ohne Passwort — für die UI. */
export async function getUserSmtp(userId: string): Promise<UserSmtpRecord | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("user_smtp_credentials")
    .select("user_id, host, port, secure, username, from_name, from_email, verified_at, last_test_error, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    userId: data.user_id as string,
    host: data.host as string,
    port: data.port as number,
    secure: data.secure as boolean,
    username: data.username as string,
    fromName: data.from_name as string,
    fromEmail: data.from_email as string,
    verifiedAt: (data.verified_at as string | null) ?? null,
    lastTestError: (data.last_test_error as string | null) ?? null,
    updatedAt: data.updated_at as string,
  };
}

/**
 * Speichert/aktualisiert die SMTP-Zugangsdaten.
 * Wenn `password` leer und ein Record existiert, bleibt das alte verschlüsselte
 * Passwort stehen (User muss Passwort-Feld nicht jedes Mal neu eingeben).
 */
export async function saveUserSmtp(
  userId: string,
  input: {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string | null; // null / "" = nicht ändern
    fromName: string;
    fromEmail: string;
    verifiedAt: Date | null;
    lastTestError: string | null;
  },
): Promise<void> {
  const db = createServiceClient();

  let passwordEncrypted: string | null = null;
  if (input.password && input.password.length > 0) {
    passwordEncrypted = encryptSecret(input.password);
  }

  const row: Record<string, unknown> = {
    user_id: userId,
    host: input.host,
    port: input.port,
    secure: input.secure,
    username: input.username,
    from_name: input.fromName,
    from_email: input.fromEmail,
    verified_at: input.verifiedAt ? input.verifiedAt.toISOString() : null,
    last_test_error: input.lastTestError,
    updated_at: new Date().toISOString(),
  };
  if (passwordEncrypted !== null) {
    row.password_encrypted = passwordEncrypted;
  }

  // Wenn kein neues Passwort geliefert wird, muss bereits ein Record existieren,
  // sonst fehlt ein Pflichtfeld. Check vorher.
  if (passwordEncrypted === null) {
    const { data: existing } = await db
      .from("user_smtp_credentials")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!existing) {
      throw new Error("Passwort ist Pflicht beim ersten Speichern.");
    }
  }

  await db.from("user_smtp_credentials").upsert(row, { onConflict: "user_id" });
}

export async function deleteUserSmtp(userId: string): Promise<void> {
  const db = createServiceClient();
  await db.from("user_smtp_credentials").delete().eq("user_id", userId);
}

// ─── IMAP ────────────────────────────────────────────────────────

export interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  sentFolder: string;
}

export interface UserImapRecord {
  userId: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  sentFolder: string;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  verifiedAt: string | null;
}

/** Lädt IMAP-Metadaten ohne Passwort. */
export async function getUserImap(userId: string): Promise<UserImapRecord | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("user_smtp_credentials")
    .select(
      "user_id, imap_host, imap_port, imap_secure, imap_username, imap_sent_folder, imap_last_sync_at, imap_last_sync_error, imap_verified_at",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || !data.imap_host) return null;
  return {
    userId: data.user_id as string,
    host: data.imap_host as string,
    port: (data.imap_port as number) ?? 993,
    secure: (data.imap_secure as boolean) ?? true,
    username: data.imap_username as string,
    sentFolder: (data.imap_sent_folder as string) ?? "Sent",
    lastSyncAt: (data.imap_last_sync_at as string | null) ?? null,
    lastSyncError: (data.imap_last_sync_error as string | null) ?? null,
    verifiedAt: (data.imap_verified_at as string | null) ?? null,
  };
}

/**
 * Speichert IMAP-Zugangsdaten. Voraussetzung: SMTP-Record existiert bereits
 * (IMAP-Felder hängen am gleichen Row).
 */
export async function saveUserImap(
  userId: string,
  input: {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string | null; // null/"" = nicht ändern
    sentFolder: string;
    verifiedAt: Date | null;
  },
): Promise<void> {
  const db = createServiceClient();

  // Sicherstellen, dass ein SMTP-Record existiert (FK über user_id-PK).
  const { data: existing } = await db
    .from("user_smtp_credentials")
    .select("user_id, imap_password_encrypted")
    .eq("user_id", userId)
    .maybeSingle();
  if (!existing) {
    throw new Error("Bitte zuerst SMTP-Zugangsdaten speichern.");
  }
  if (!input.password && !existing.imap_password_encrypted) {
    throw new Error("IMAP-Passwort ist Pflicht beim ersten Speichern.");
  }

  const update: Record<string, unknown> = {
    imap_host: input.host,
    imap_port: input.port,
    imap_secure: input.secure,
    imap_username: input.username,
    imap_sent_folder: input.sentFolder,
    imap_verified_at: input.verifiedAt ? input.verifiedAt.toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  if (input.password && input.password.length > 0) {
    update.imap_password_encrypted = encryptSecret(input.password);
  }

  await db.from("user_smtp_credentials").update(update).eq("user_id", userId);
}

export async function deleteUserImap(userId: string): Promise<void> {
  const db = createServiceClient();
  await db
    .from("user_smtp_credentials")
    .update({
      imap_host: null,
      imap_port: null,
      imap_username: null,
      imap_password_encrypted: null,
      imap_sent_folder: null,
      imap_last_uid_inbox: null,
      imap_last_uid_sent: null,
      imap_last_sync_at: null,
      imap_last_sync_error: null,
      imap_verified_at: null,
    })
    .eq("user_id", userId);
}

/** Lädt komplette ImapConfig inkl. entschlüsseltem Passwort. Nur im Server. */
export async function loadDecryptedImap(userId: string): Promise<ImapConfig | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("user_smtp_credentials")
    .select(
      "imap_host, imap_port, imap_secure, imap_username, imap_password_encrypted, imap_sent_folder",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || !data.imap_host || !data.imap_password_encrypted) return null;
  try {
    const password = decryptSecret(data.imap_password_encrypted as string);
    return {
      host: data.imap_host as string,
      port: (data.imap_port as number) ?? 993,
      secure: (data.imap_secure as boolean) ?? true,
      username: data.imap_username as string,
      password,
      sentFolder: (data.imap_sent_folder as string) ?? "Sent",
    };
  } catch {
    return null;
  }
}

/** Lädt Sync-Cursor für inkrementellen IMAP-Sync. */
export async function loadImapSyncCursor(
  userId: string,
): Promise<{ lastUidInbox: number | null; lastUidSent: number | null }> {
  const db = createServiceClient();
  const { data } = await db
    .from("user_smtp_credentials")
    .select("imap_last_uid_inbox, imap_last_uid_sent")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    lastUidInbox: (data?.imap_last_uid_inbox as number | null) ?? null,
    lastUidSent: (data?.imap_last_uid_sent as number | null) ?? null,
  };
}

export async function updateImapSyncCursor(
  userId: string,
  cursor: { lastUidInbox?: number | null; lastUidSent?: number | null },
  error: string | null = null,
): Promise<void> {
  const db = createServiceClient();
  const update: Record<string, unknown> = {
    imap_last_sync_at: new Date().toISOString(),
    imap_last_sync_error: error,
  };
  if (cursor.lastUidInbox !== undefined) update.imap_last_uid_inbox = cursor.lastUidInbox;
  if (cursor.lastUidSent !== undefined) update.imap_last_uid_sent = cursor.lastUidSent;
  await db.from("user_smtp_credentials").update(update).eq("user_id", userId);
}

// ─── Backfill-Settings ─────────────────────────────────────────────

export interface BackfillSettings {
  /** Tage in die Vergangenheit. 0 = unbegrenzt. */
  days: number;
  /** Wenn gesetzt, ignoriert der nächste Sync den UID-Cursor und macht One-Shot-Deep-Backfill. */
  deepSyncRequestedAt: string | null;
}

export async function getBackfillSettings(userId: string): Promise<BackfillSettings> {
  const db = createServiceClient();
  const { data } = await db
    .from("user_smtp_credentials")
    .select("imap_backfill_days, imap_deep_sync_requested_at")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    days: (data?.imap_backfill_days as number | null) ?? 30,
    deepSyncRequestedAt: (data?.imap_deep_sync_requested_at as string | null) ?? null,
  };
}

export async function setBackfillDays(userId: string, days: number): Promise<void> {
  const db = createServiceClient();
  const clean = Number.isFinite(days) && days >= 0 ? Math.floor(days) : 30;
  await db
    .from("user_smtp_credentials")
    .update({ imap_backfill_days: clean, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
}

export async function requestDeepSync(userId: string): Promise<void> {
  const db = createServiceClient();
  await db
    .from("user_smtp_credentials")
    .update({
      imap_deep_sync_requested_at: new Date().toISOString(),
      // Cursor zurücksetzen, damit der nächste Sync wirklich von vorne läuft.
      imap_last_uid_inbox: null,
      imap_last_uid_sent: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
}

export async function clearDeepSyncMarker(userId: string): Promise<void> {
  const db = createServiceClient();
  await db
    .from("user_smtp_credentials")
    .update({ imap_deep_sync_requested_at: null })
    .eq("user_id", userId);
}

/** Lädt komplettes SmtpConfig inkl. entschlüsseltem Passwort. Nur im Server. */
export async function loadDecryptedSmtp(userId: string): Promise<SmtpConfig | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("user_smtp_credentials")
    .select("host, port, secure, username, password_encrypted, from_name, from_email")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  try {
    const password = decryptSecret(data.password_encrypted as string);
    return {
      host: data.host as string,
      port: data.port as number,
      secure: data.secure as boolean,
      username: data.username as string,
      password,
      fromName: data.from_name as string,
      fromEmail: data.from_email as string,
    };
  } catch {
    return null;
  }
}
