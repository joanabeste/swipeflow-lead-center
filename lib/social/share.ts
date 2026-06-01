import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { getOrCreateBoard } from "./data";
import { generateShareToken, buildShareLink } from "./share-token";
import type { SocialBoard } from "./types";

export { generateShareToken, buildShareLink };

/**
 * Stellt sicher, dass das Board des Kunden ein aktives Freigabe-Token hat, und
 * gibt Token + absoluten Link zurück. Legt das Board bei Bedarf an.
 */
export async function ensureBoardShareLink(
  leadId: string,
  userId: string | null,
): Promise<{ token: string; url: string } | { error: string }> {
  const board = await getOrCreateBoard(leadId, userId);
  if (!board) return { error: "Board konnte nicht angelegt werden." };

  let token = board.share_token;
  if (!token || !board.share_enabled) {
    token = token ?? generateShareToken();
    const db = createServiceClient();
    const { error } = await db
      .from("social_boards")
      .update({ share_token: token, share_enabled: true })
      .eq("id", board.id);
    if (error) return { error: error.message };
  }
  return { token, url: buildShareLink(token) };
}

/** Deaktiviert den Freigabelink (Kill-Switch — Token bleibt erhalten). */
export async function disableShareLink(leadId: string): Promise<{ error?: string }> {
  const db = createServiceClient();
  const { error } = await db
    .from("social_boards")
    .update({ share_enabled: false })
    .eq("lead_id", leadId);
  return error ? { error: error.message } : {};
}

/** Generiert ein neues Token (invalidiert den alten Link) und aktiviert ihn. */
export async function rotateShareToken(
  leadId: string,
  userId: string | null,
): Promise<{ token: string; url: string } | { error: string }> {
  const board = await getOrCreateBoard(leadId, userId);
  if (!board) return { error: "Board konnte nicht angelegt werden." };
  const token = generateShareToken();
  const db = createServiceClient();
  const { error } = await db
    .from("social_boards")
    .update({ share_token: token, share_enabled: true })
    .eq("id", board.id);
  if (error) return { error: error.message };
  return { token, url: buildShareLink(token) };
}

export type { SocialBoard };
