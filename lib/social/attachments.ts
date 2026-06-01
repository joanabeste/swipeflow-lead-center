import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import {
  SOCIAL_ALLOWED_MIMES,
  SOCIAL_MEDIA_BUCKET,
  maxBytesForMime,
  mediaKindForMime,
  sanitizeFileName,
  formatBytes,
  type SocialUploadTicket,
  type UploadedMediaRef,
} from "./format";
import type { LoadedPostMedia, SocialPostMedia } from "./types";

export { SOCIAL_MEDIA_BUCKET };
export type { SocialUploadTicket, UploadedMediaRef };

function validateMeta(meta: { mimeType: string; sizeBytes: number }): string | null {
  if (!SOCIAL_ALLOWED_MIMES.has(meta.mimeType)) {
    return `Dateityp ${meta.mimeType || "unbekannt"} ist nicht erlaubt.`;
  }
  if (meta.sizeBytes <= 0) return "Datei ist leer.";
  const max = maxBytesForMime(meta.mimeType);
  if (meta.sizeBytes > max) {
    return `Datei zu groß (max. ${formatBytes(max)}).`;
  }
  return null;
}

/**
 * Erzeugt für eine Liste angefragter Dateien signed Upload-URLs. Der Browser lädt
 * dann via PUT direkt in den Bucket — das Vercel-Function-Payload-Limit (~4.5 MB)
 * wird so umgangen (essenziell für Videos).
 */
export async function createSocialMediaUploadTickets(params: {
  leadId: string;
  files: { clientId: string; fileName: string; mimeType: string; sizeBytes: number }[];
}): Promise<{ tickets: SocialUploadTicket[]; errors: { clientId: string; error: string }[] }> {
  const db = createServiceClient();
  const tickets: SocialUploadTicket[] = [];
  const errors: { clientId: string; error: string }[] = [];

  for (const f of params.files) {
    const v = validateMeta(f);
    if (v) {
      errors.push({ clientId: f.clientId, error: v });
      continue;
    }
    const safeName = sanitizeFileName(f.fileName);
    const path = `${params.leadId}/${crypto.randomUUID()}-${safeName}`;
    const { data, error } = await db.storage.from(SOCIAL_MEDIA_BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      const msg = /Bucket not found/i.test(error?.message ?? "")
        ? "Bucket social-media fehlt — Migration 109 ausführen."
        : (error?.message ?? "Upload-Ticket konnte nicht erzeugt werden.");
      errors.push({ clientId: f.clientId, error: msg });
      continue;
    }
    tickets.push({
      clientId: f.clientId,
      storagePath: data.path,
      signedUrl: data.signedUrl,
      token: data.token,
      fileName: f.fileName,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
    });
  }
  return { tickets, errors };
}

/**
 * Registriert eine bereits per Direct-Upload im Bucket liegende Datei als Medium
 * eines Posts. Verifiziert Pfad-Sicherheit + Existenz im Bucket; Cleanup bei Fehler.
 */
export async function registerPostMedia(params: {
  leadId: string;
  postId: string;
  userId: string | null;
  ref: UploadedMediaRef;
  sortOrder: number;
}): Promise<{ media: SocialPostMedia } | { error: string }> {
  const v = validateMeta(params.ref);
  if (v) return { error: v };

  const kind = mediaKindForMime(params.ref.mimeType);
  if (!kind) return { error: "Unbekannter Medientyp." };

  const db = createServiceClient();

  // Pfad-Sicherheit: der gemeldete Pfad MUSS unter {leadId}/ liegen.
  if (!params.ref.storagePath.startsWith(`${params.leadId}/`)) {
    return { error: "Ungültiger Storage-Pfad." };
  }

  // Existenz-Check via list.
  const folder = params.ref.storagePath.split("/").slice(0, -1).join("/");
  const fileName = params.ref.storagePath.split("/").pop() ?? "";
  const { data: listing, error: listErr } = await db.storage
    .from(SOCIAL_MEDIA_BUCKET)
    .list(folder, { limit: 1000, search: fileName });
  if (listErr) return { error: `Storage-Check fehlgeschlagen: ${listErr.message}` };
  const match = (listing ?? []).find((o) => o.name === fileName);
  if (!match) return { error: "Hochgeladene Datei nicht im Bucket gefunden." };

  const { data: row, error: insertErr } = await db
    .from("social_post_media")
    .insert({
      post_id: params.postId,
      lead_id: params.leadId,
      storage_path: params.ref.storagePath,
      file_name: params.ref.fileName,
      mime_type: params.ref.mimeType,
      size_bytes: params.ref.sizeBytes,
      media_kind: kind,
      sort_order: params.sortOrder,
      created_by: params.userId,
    })
    .select()
    .single();

  if (insertErr || !row) {
    await db.storage.from(SOCIAL_MEDIA_BUCKET).remove([params.ref.storagePath]);
    if (insertErr && /relation.*does not exist/i.test(insertErr.message)) {
      return { error: "Tabelle social_post_media fehlt — Migration 109 ausführen." };
    }
    return { error: insertErr?.message ?? "Medium konnte nicht gespeichert werden." };
  }
  return { media: row as SocialPostMedia };
}

/** Löscht ein einzelnes Medium inkl. Storage-Objekt. */
export async function deletePostMedia(mediaId: string): Promise<{ error?: string }> {
  const db = createServiceClient();
  const { data: row, error: selErr } = await db
    .from("social_post_media")
    .select("storage_path")
    .eq("id", mediaId)
    .maybeSingle();
  if (selErr) return { error: selErr.message };
  if (!row) return {};

  const { error: storageErr } = await db.storage
    .from(SOCIAL_MEDIA_BUCKET)
    .remove([row.storage_path as string]);
  if (storageErr) console.warn("[deletePostMedia] storage remove failed:", storageErr.message);

  const { error: delErr } = await db.from("social_post_media").delete().eq("id", mediaId);
  if (delErr) return { error: delErr.message };
  return {};
}

/** Löscht alle Medien eines Posts aus dem Storage (DB-Rows räumt das CASCADE).
 *  VOR dem Post-Delete aufrufen, sonst bleiben die Storage-Objekte verwaist. */
export async function deleteMediaForPost(postId: string): Promise<void> {
  const db = createServiceClient();
  const { data: rows } = await db
    .from("social_post_media")
    .select("storage_path")
    .eq("post_id", postId);
  const paths = (rows ?? []).map((r) => r.storage_path as string).filter(Boolean);
  if (paths.length > 0) {
    const { error } = await db.storage.from(SOCIAL_MEDIA_BUCKET).remove(paths);
    if (error) console.warn("[deleteMediaForPost] storage remove failed:", error.message);
  }
}

/** Signed URL für die Anzeige eines Mediums. Default 1 Stunde, öffentlich länger. */
export async function getPostMediaSignedUrl(path: string, expiresInSec = 3600): Promise<string | null> {
  const db = createServiceClient();
  const { data, error } = await db.storage
    .from(SOCIAL_MEDIA_BUCKET)
    .createSignedUrl(path, expiresInSec);
  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * Bulk-Fetch aller Medien zu einer Liste von Post-IDs, inkl. signed URLs.
 * Ergebnis ist nach `post_id` gruppiert und je Post nach `sort_order` sortiert.
 */
export async function loadPostMediaForPosts(
  postIds: string[],
  expiresInSec = 3600,
): Promise<Map<string, LoadedPostMedia[]>> {
  const map = new Map<string, LoadedPostMedia[]>();
  if (postIds.length === 0) return map;

  const db = createServiceClient();
  const { data: rows } = await db
    .from("social_post_media")
    .select("id, post_id, storage_path, file_name, mime_type, size_bytes, media_kind, sort_order")
    .in("post_id", postIds)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (!rows || rows.length === 0) return map;

  const loaded = await Promise.all(
    rows.map(async (r) => {
      const url = await getPostMediaSignedUrl(r.storage_path as string, expiresInSec);
      return {
        id: r.id as string,
        post_id: r.post_id as string,
        file_name: r.file_name as string,
        mime_type: r.mime_type as string,
        size_bytes: r.size_bytes as number,
        media_kind: r.media_kind as LoadedPostMedia["media_kind"],
        sort_order: r.sort_order as number,
        signed_url: url,
      } satisfies LoadedPostMedia;
    }),
  );

  for (const m of loaded) {
    const list = map.get(m.post_id) ?? [];
    list.push(m);
    map.set(m.post_id, list);
  }
  return map;
}

/** Setzt die Carousel-Reihenfolge komplett neu (0..n) — kein inkrementelles Drift. */
export async function reorderPostMedia(postId: string, orderedMediaIds: string[]): Promise<{ error?: string }> {
  const db = createServiceClient();
  for (let i = 0; i < orderedMediaIds.length; i++) {
    const { error } = await db
      .from("social_post_media")
      .update({ sort_order: i })
      .eq("id", orderedMediaIds[i])
      .eq("post_id", postId);
    if (error) return { error: error.message };
  }
  return {};
}
