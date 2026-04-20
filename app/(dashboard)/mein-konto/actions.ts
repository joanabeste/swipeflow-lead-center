"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import { uploadAvatar, deleteAvatar } from "@/lib/supabase/avatar";
import {
  guessSalutationFromName,
  guessSalutationFromEmailLocalpart,
} from "@/lib/contacts/salutation-from-name";

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
 * Namens-Heuristik (primär) bzw. E-Mail-Localpart (Fallback) eine Anrede
 * zu setzen. Idempotent — mehrfaches Ausführen schadet nicht, wirkt nur
 * einmalig auf noch leere Felder.
 *
 * Mit `{ dryRun: true }` werden keine DB-Updates gemacht; Rückgabe enthält
 * stattdessen `wouldUpdate` + `bySource`/`byGender`-Breakdown, damit man die
 * Quote vor dem realen Run messen kann.
 */
export type BackfillResult =
  | {
      success: true;
      scanned: number;
      updated: number;
      wouldUpdate?: number;
      bySource: { name: number; email: number };
      byGender: { herr: number; frau: number };
      dryRun: boolean;
    }
  | { error: string };

export async function backfillContactSalutations(
  opts: { dryRun?: boolean } = {},
): Promise<BackfillResult> {
  const dryRun = opts.dryRun === true;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const db = createServiceClient();
  const { data: contacts, error } = await db
    .from("lead_contacts")
    .select("id, name, email")
    .is("salutation", null);
  if (error) return { error: error.message };

  const rows = (contacts ?? []) as { id: string; name: string; email: string | null }[];
  const updates: { id: string; salutation: "herr" | "frau"; source: "name" | "email" }[] = [];
  for (const c of rows) {
    const nameHit = guessSalutationFromName(c.name);
    if (nameHit) {
      updates.push({ id: c.id, salutation: nameHit, source: "name" });
      continue;
    }
    const emailHit = guessSalutationFromEmailLocalpart(c.email);
    if (emailHit) updates.push({ id: c.id, salutation: emailHit, source: "email" });
  }

  const bySource = {
    name: updates.filter((u) => u.source === "name").length,
    email: updates.filter((u) => u.source === "email").length,
  };
  const byGender = {
    herr: updates.filter((u) => u.salutation === "herr").length,
    frau: updates.filter((u) => u.salutation === "frau").length,
  };

  if (!dryRun) {
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
      details: { scanned: rows.length, updated: updates.length, bySource, byGender },
    });

    revalidatePath("/mein-konto");
  }

  return {
    success: true,
    scanned: rows.length,
    updated: dryRun ? 0 : updates.length,
    ...(dryRun ? { wouldUpdate: updates.length } : {}),
    bySource,
    byGender,
    dryRun,
  };
}

// ─── Dashboard-Layout zurücksetzen ───────────────────────────

/**
 * Setzt das Dashboard-Layout des aktuellen Users auf NULL zurück, sodass
 * beim nächsten Render der aktuelle Default aus der Registry greift. Praktisch,
 * wenn wir das Default-Layout ändern und der User es ohne SQL-Eingriff
 * übernehmen will.
 */
export async function resetDashboardLayout(): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const db = createServiceClient();
  const { error } = await db
    .from("profiles")
    .update({ dashboard_widgets: null, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    action: "dashboard.layout_reset",
    entityType: "profile",
    entityId: user.id,
  });

  revalidatePath("/");
  revalidatePath("/mein-konto");
  return { success: true };
}
