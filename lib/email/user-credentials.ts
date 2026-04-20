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
