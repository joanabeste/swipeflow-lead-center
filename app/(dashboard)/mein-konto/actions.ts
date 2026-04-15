"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { listMySources } from "@/lib/phonemondo/client";
import type { PhonemondoSource } from "@/lib/phonemondo/types";

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

/** Für User-Auswahl im Mein-Konto UND Admin-Settings: lade die verfügbaren Sources. */
export async function fetchMyPhonemondoSources(): Promise<
  { success: true; sources: PhonemondoSource[] } | { success: false; error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht angemeldet." };
  try {
    const sources = await listMySources();
    return { success: true, sources };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}

export async function savePhonemondoExtension(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const raw = (formData.get("extension") as string | null) ?? "";
  const extension = raw.trim() || null;

  const db = createServiceClient();
  const { error } = await db
    .from("profiles")
    .update({ phonemondo_extension: extension, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return { error: "Konnte nicht gespeichert werden." };

  revalidatePath("/mein-konto");
  return { success: true };
}
