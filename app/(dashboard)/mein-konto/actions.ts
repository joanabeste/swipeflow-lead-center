"use server";

import { createClient } from "@/lib/supabase/server";

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
