"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { TrafficLightRating } from "@/lib/types";

// Batch-Groesse + TTL der Reservierung. Heartbeat (extendQualifyClaims) muss
// haeufiger als TTL laufen, damit eine offene Sitzung nie verfaellt.
const BATCH_SIZE = 50;
const TTL_SECONDS = 600; // 10 Minuten

export interface QualifyClaim {
  id: string;
  rating: TrafficLightRating | null;
}

/**
 * Reserviert dem aktuellen Nutzer einen disjunkten Batch (bis BATCH_SIZE) und
 * gibt ihn zurueck. Atomar via RPC (FOR UPDATE SKIP LOCKED) → zwei Nutzer greifen
 * nie denselben Lead. Erneuter Aufruf verlaengert die eigenen Claims und fuellt
 * auf — eignet sich auch fuer „Weitere laden".
 */
export async function claimQualifyBatch(): Promise<QualifyClaim[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const db = createServiceClient();
  const { data, error } = await db.rpc("claim_qualify_leads", {
    p_user: user.id,
    p_limit: BATCH_SIZE,
    p_ttl_seconds: TTL_SECONDS,
  });
  if (error) {
    console.error("[claimQualifyBatch]", error.message);
    return [];
  }
  return ((data as { id: string; rating: string | null }[]) ?? []).map((r) => ({
    id: r.id,
    rating: (r.rating as TrafficLightRating | null) ?? null,
  }));
}

/**
 * Heartbeat: verlaengert alle Reservierungen des Nutzers (solange das Cockpit
 * offen ist). Die Freigabe beim Verlassen laeuft ueber die Beacon-Route
 * `/api/qualify/release` (im Unload zuverlaessiger als eine Server-Action).
 */
export async function extendQualifyClaims(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const db = createServiceClient();
  await db
    .from("lead_qualify_claims")
    .update({ expires_at: new Date(Date.now() + TTL_SECONDS * 1000).toISOString() })
    .eq("claimed_by", user.id);
}
