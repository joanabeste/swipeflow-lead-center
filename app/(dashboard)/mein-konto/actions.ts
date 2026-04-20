"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import { uploadAvatar, deleteAvatar } from "@/lib/supabase/avatar";
import {
  saveUserSmtp,
  deleteUserSmtp,
  loadDecryptedSmtp,
} from "@/lib/email/user-credentials";
import { verifySmtp } from "@/lib/email/smtp";
import { guessSalutationFromName } from "@/lib/contacts/salutation-from-name";

export async function changeMyPassword(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  const newPassword = formData.get("newPassword") as string;
  const confirm = formData.get("confirm") as string;

  if (!newPassword || newPassword.length < 8) {
    return { error: "Neues Passwort muss mindestens 8 Zeichen lang sein." };
  }
  if (newPassword !== confirm) {
    return { error: "Passwörter stimmen nicht überein." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: "Passwort konnte nicht geändert werden." };

  return { success: true };
}

// ─── Profilbild ───────────────────────────────────────────────

/**
 * Lädt ein JPEG-Blob (nach Crop vom Client) in den Avatars-Bucket und
 * setzt `profiles.avatar_url`. Max. 5 MB.
 */
export async function saveMyAvatar(
  dataUrl: string,
): Promise<{ error?: string; url?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  // Data-URL parsen: "data:image/jpeg;base64,...."
  const match = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return { error: "Ungültiges Bild-Format." };
  const contentType = match[1];
  if (!/^image\/(jpeg|png|webp)$/.test(contentType)) {
    return { error: "Nur JPEG/PNG/WebP erlaubt." };
  }
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 5 * 1024 * 1024) {
    return { error: "Bild zu groß (max. 5 MB)." };
  }

  const res = await uploadAvatar(user.id, bytes, contentType);
  if ("error" in res) return { error: res.error };

  await logAudit({
    userId: user.id,
    action: "profile.avatar_uploaded",
    entityType: "profile",
    entityId: user.id,
  });

  revalidatePath("/mein-konto");
  return { url: res.url };
}

export async function removeMyAvatar(): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const res = await deleteAvatar(user.id);
  if ("error" in res) return { error: res.error };

  await logAudit({
    userId: user.id,
    action: "profile.avatar_deleted",
    entityType: "profile",
    entityId: user.id,
  });

  revalidatePath("/mein-konto");
  return { success: true };
}

// ─── E-Mail / SMTP ───────────────────────────────────────────

interface SmtpFormInput {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string | null;
  fromName: string;
  fromEmail: string;
}

function parseSmtpFormData(formData: FormData): { ok: true; input: SmtpFormInput } | { ok: false; error: string } {
  const host = ((formData.get("host") as string) ?? "").trim();
  const portRaw = (formData.get("port") as string) ?? "";
  const username = ((formData.get("username") as string) ?? "").trim();
  const password = ((formData.get("password") as string) ?? ""); // nicht trimmen — manche Passwörter haben Leerzeichen
  const fromName = ((formData.get("from_name") as string) ?? "").trim();
  const fromEmail = ((formData.get("from_email") as string) ?? "").trim();
  const secure = formData.get("secure") === "on";

  if (!host) return { ok: false, error: "Host fehlt." };
  if (!username) return { ok: false, error: "Username fehlt." };
  if (!fromName) return { ok: false, error: "Absender-Name fehlt." };
  if (!fromEmail) return { ok: false, error: "Absender-Adresse fehlt." };

  const port = parseInt(portRaw, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return { ok: false, error: "Port muss zwischen 1 und 65535 liegen." };
  }

  return {
    ok: true,
    input: {
      host, port, secure, username,
      password: password.length > 0 ? password : null,
      fromName, fromEmail,
    },
  };
}

async function resolvePassword(userId: string, formPassword: string | null): Promise<string | null> {
  // Wenn der User das Passwort-Feld leer gelassen hat, altes verschlüsseltes
  // Passwort wiederverwenden. Für den Verify brauchen wir den Klartext.
  if (formPassword && formPassword.length > 0) return formPassword;
  const existing = await loadDecryptedSmtp(userId);
  return existing?.password ?? null;
}

export async function saveEmailSettings(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const parsed = parseSmtpFormData(formData);
  if (!parsed.ok) return { error: parsed.error };
  const input = parsed.input;

  const password = await resolvePassword(user.id, input.password);
  if (!password) {
    return { error: "Passwort ist Pflicht beim ersten Speichern." };
  }

  // Live-Verify vor dem Persistieren — falsche Credentials sollen nicht
  // als „gespeichert" erscheinen.
  const verify = await verifySmtp({
    host: input.host, port: input.port, secure: input.secure,
    username: input.username, password,
    fromName: input.fromName, fromEmail: input.fromEmail,
  });

  await saveUserSmtp(user.id, {
    host: input.host, port: input.port, secure: input.secure,
    username: input.username,
    password: input.password, // nur wenn User neues eingegeben hat
    fromName: input.fromName,
    fromEmail: input.fromEmail,
    verifiedAt: verify.ok ? new Date() : null,
    lastTestError: verify.ok ? null : verify.error,
  });

  await logAudit({
    userId: user.id,
    action: "email.smtp.saved",
    entityType: "user_smtp_credentials",
    entityId: user.id,
    details: { host: input.host, port: input.port, from_email: input.fromEmail, verified: verify.ok },
  });

  revalidatePath("/mein-konto");

  if (!verify.ok) {
    return { error: `Gespeichert, aber Verify fehlgeschlagen: ${verify.error}` };
  }
  return { success: true };
}

export async function testEmailSettings(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const parsed = parseSmtpFormData(formData);
  if (!parsed.ok) return { error: parsed.error };
  const input = parsed.input;

  const password = await resolvePassword(user.id, input.password);
  if (!password) return { error: "Kein Passwort angegeben oder hinterlegt." };

  const verify = await verifySmtp({
    host: input.host, port: input.port, secure: input.secure,
    username: input.username, password,
    fromName: input.fromName, fromEmail: input.fromEmail,
  });

  if (!verify.ok) return { error: `Verbindung fehlgeschlagen: ${verify.error}` };
  return { success: true };
}

export async function deleteEmailSettings(): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  await deleteUserSmtp(user.id);
  await logAudit({
    userId: user.id,
    action: "email.smtp.deleted",
    entityType: "user_smtp_credentials",
    entityId: user.id,
  });

  revalidatePath("/mein-konto");
  return { success: true };
}

// ─── Wartung: Anrede aus Vornamen nachtragen ─────────────────

/**
 * Läuft über alle lead_contacts mit salutation=NULL und versucht per
 * Namens-Heuristik eine Anrede zu setzen. Idempotent — mehrfaches Ausführen
 * schadet nicht, wirkt nur einmalig auf noch leere Felder.
 */
export async function backfillContactSalutations(): Promise<{
  success: true;
  scanned: number;
  updated: number;
} | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const db = createServiceClient();
  const { data: contacts, error } = await db
    .from("lead_contacts")
    .select("id, name")
    .is("salutation", null);
  if (error) return { error: error.message };

  const rows = (contacts ?? []) as { id: string; name: string }[];
  const updates: { id: string; salutation: "herr" | "frau" }[] = [];
  for (const c of rows) {
    const guess = guessSalutationFromName(c.name);
    if (guess) updates.push({ id: c.id, salutation: guess });
  }

  // Batch-Update in 200er-Chunks, um bei großen Datenmengen nicht zu timen.
  for (let i = 0; i < updates.length; i += 200) {
    const chunk = updates.slice(i, i + 200);
    await Promise.all(
      chunk.map((u) =>
        db.from("lead_contacts").update({ salutation: u.salutation }).eq("id", u.id),
      ),
    );
  }

  await logAudit({
    userId: user.id,
    action: "contacts.salutation_backfilled",
    entityType: "lead_contacts",
    details: { scanned: rows.length, updated: updates.length },
  });

  revalidatePath("/mein-konto");
  return { success: true, scanned: rows.length, updated: updates.length };
}
