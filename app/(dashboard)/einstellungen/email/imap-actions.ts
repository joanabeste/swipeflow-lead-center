"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import {
  saveUserImap,
  deleteUserImap,
  loadDecryptedImap,
} from "@/lib/email/user-credentials";
import { verifyImap } from "@/lib/email/imap";
import { syncUserMailbox } from "@/lib/email/sync";

interface ImapFormInput {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string | null;
  sentFolder: string;
}

function parseForm(formData: FormData): { ok: true; input: ImapFormInput } | { ok: false; error: string } {
  const host = ((formData.get("imap_host") as string) ?? "").trim();
  const portRaw = (formData.get("imap_port") as string) ?? "993";
  const username = ((formData.get("imap_username") as string) ?? "").trim();
  const password = ((formData.get("imap_password") as string) ?? "");
  const sentFolder = ((formData.get("imap_sent_folder") as string) ?? "Sent").trim() || "Sent";

  if (!host) return { ok: false, error: "Host fehlt." };
  if (!username) return { ok: false, error: "Username fehlt." };

  const port = parseInt(portRaw, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return { ok: false, error: "Port muss zwischen 1 und 65535 liegen." };
  }

  return {
    ok: true,
    input: {
      host, port, secure: port === 993, username,
      password: password.length > 0 ? password : null,
      sentFolder,
    },
  };
}

async function resolvePassword(userId: string, fromForm: string | null): Promise<string | null> {
  if (fromForm && fromForm.length > 0) return fromForm;
  const existing = await loadDecryptedImap(userId);
  return existing?.password ?? null;
}

export async function saveImapSettings(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const parsed = parseForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const input = parsed.input;

  const password = await resolvePassword(user.id, input.password);
  if (!password) return { error: "Passwort ist Pflicht beim ersten Speichern." };

  const verify = await verifyImap({
    host: input.host, port: input.port, secure: input.secure,
    username: input.username, password, sentFolder: input.sentFolder,
  });

  await saveUserImap(user.id, {
    host: input.host, port: input.port, secure: input.secure,
    username: input.username,
    password: input.password,
    sentFolder: input.sentFolder,
    verifiedAt: verify.ok ? new Date() : null,
  });

  await logAudit({
    userId: user.id,
    action: "email.imap.saved",
    entityType: "user_smtp_credentials",
    entityId: user.id,
    details: { host: input.host, port: input.port, verified: verify.ok },
  });

  revalidatePath("/einstellungen/email");

  if (!verify.ok) return { error: `Gespeichert, aber Verify fehlgeschlagen: ${verify.error}` };
  return { success: true };
}

export async function testImapSettings(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const parsed = parseForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const input = parsed.input;

  const password = await resolvePassword(user.id, input.password);
  if (!password) return { error: "Kein Passwort angegeben oder hinterlegt." };

  const verify = await verifyImap({
    host: input.host, port: input.port, secure: input.secure,
    username: input.username, password, sentFolder: input.sentFolder,
  });

  if (!verify.ok) return { error: `Verbindung fehlgeschlagen: ${verify.error}` };
  const folderList = verify.folders.slice(0, 8).join(", ");
  return { success: true, error: undefined };
}

export async function deleteImapSettings(): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };
  await deleteUserImap(user.id);
  await logAudit({
    userId: user.id, action: "email.imap.deleted",
    entityType: "user_smtp_credentials", entityId: user.id,
  });
  revalidatePath("/einstellungen/email");
  return { success: true };
}

export async function triggerManualSync(
  _prev: { error?: string; success?: boolean } | undefined,
  _formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const res = await syncUserMailbox(user.id);
  if (!res.ok) return { error: res.error };
  revalidatePath("/einstellungen/email");
  return { success: true };
}
