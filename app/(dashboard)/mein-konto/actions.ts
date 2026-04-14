"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function changeMyPassword(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  const currentPassword = formData.get("currentPassword") as string;
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
  if (!user?.email) return { error: "Nicht angemeldet." };

  // Aktuelles Passwort verifizieren (wenn angegeben)
  // Hinweis: User die bisher nur Magic Link genutzt haben, haben kein Passwort
  // und können hier das Feld leer lassen
  if (currentPassword) {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (signInError) return { error: "Aktuelles Passwort ist falsch." };
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: "Passwort konnte nicht geändert werden." };

  return { success: true };
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
