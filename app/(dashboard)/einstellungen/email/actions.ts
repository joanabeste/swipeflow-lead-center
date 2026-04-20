"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import {
  saveUserSmtp,
  deleteUserSmtp,
  loadDecryptedSmtp,
} from "@/lib/email/user-credentials";
import { verifySmtp } from "@/lib/email/smtp";

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
  // Das UI sendet "starttls" oder "ssl" statt einer Checkbox — robust lesen.
  const securityMode = (formData.get("security_mode") as string) ?? "";
  const secure = securityMode === "ssl";

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

  const verify = await verifySmtp({
    host: input.host, port: input.port, secure: input.secure,
    username: input.username, password,
    fromName: input.fromName, fromEmail: input.fromEmail,
  });

  await saveUserSmtp(user.id, {
    host: input.host, port: input.port, secure: input.secure,
    username: input.username,
    password: input.password,
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

  revalidatePath("/einstellungen/email");

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

  revalidatePath("/einstellungen/email");
  return { success: true };
}
