"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import { uploadAvatar, deleteAvatar } from "@/lib/supabase/avatar";
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
