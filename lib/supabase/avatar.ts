import { createServiceClient } from "@/lib/supabase/server";

const BUCKET = "avatars";

/**
 * Lädt ein Avatar-Blob in den Storage-Bucket `avatars` hoch und
 * aktualisiert `profiles.avatar_url` mit der Public-URL.
 *
 * Überschreibt alte Avatare desselben Users (gleicher path `{userId}/profile.jpg`),
 * sodass kein Cleanup nötig ist.
 */
export async function uploadAvatar(
  userId: string,
  fileBytes: Uint8Array,
  contentType: string,
): Promise<{ url: string } | { error: string }> {
  const db = createServiceClient();
  const path = `${userId}/profile.jpg`;
  const { error: uploadErr } = await db.storage
    .from(BUCKET)
    .upload(path, fileBytes, {
      contentType,
      upsert: true,
      cacheControl: "3600",
    });
  if (uploadErr) return { error: uploadErr.message };

  const { data } = db.storage.from(BUCKET).getPublicUrl(path);
  // Cache-Buster mit Timestamp, damit der Browser neu lädt.
  const url = `${data.publicUrl}?v=${Date.now()}`;

  const { error: updateErr } = await db
    .from("profiles")
    .update({ avatar_url: url, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (updateErr) return { error: updateErr.message };

  return { url };
}

export async function deleteAvatar(userId: string): Promise<{ success: true } | { error: string }> {
  const db = createServiceClient();
  const path = `${userId}/profile.jpg`;
  const { error: delErr } = await db.storage.from(BUCKET).remove([path]);
  // Entfernen-Fehler ignorieren, wenn Datei eh nicht da (noch kein Upload).
  if (delErr && !/not found/i.test(delErr.message)) return { error: delErr.message };
  const { error: updateErr } = await db
    .from("profiles")
    .update({ avatar_url: null, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (updateErr) return { error: updateErr.message };
  return { success: true };
}
