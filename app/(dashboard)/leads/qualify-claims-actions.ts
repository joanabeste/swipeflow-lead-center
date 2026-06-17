"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { TrafficLightRating } from "@/lib/types";

// Reservierung pro Ampel-Kategorie (gruen/orange/rot/unbewertet) + TTL. Heartbeat
// (extendQualifyClaims) muss haeufiger als TTL laufen, damit eine offene Sitzung
// nie verfaellt.
const PER_RATING = 50;
const TTL_SECONDS = 600; // 10 Minuten

// Globaler Fallback (RPC fehlt): seitenweise laden (PostgREST max 1000/Seite),
// Sicherheits-Obergrenze gegen Ausreisser — analog zur Cockpit-Queue.
const PAGE = 1000;
const MAX_FALLBACK = 6000;

type LeadCardRow = {
  id: string;
  company_name: string | null;
  website: string | null;
  traffic_light_rating: string | null;
  traffic_light_reason: string | null;
};

/** DB-Zeilen → anzeige-fertige Karten; Leads ohne (echte) Website werden verworfen. */
function toTinderCards(rows: LeadCardRow[] | null): TinderCard[] {
  const cards: TinderCard[] = [];
  for (const r of rows ?? []) {
    if (!r.website?.trim()) continue; // Whitespace-only zusaetzlich raus
    cards.push({
      id: r.id,
      company_name: r.company_name ?? "Unbekannt",
      website: r.website,
      rating: (r.traffic_light_rating as TrafficLightRating | null) ?? null,
      reason: r.traffic_light_reason,
    });
  }
  return cards;
}

export interface QualifyClaim {
  id: string;
  rating: TrafficLightRating | null;
}

/** Anzeige-fertige Karte fuer die mobile Lead-Tinder-Ansicht (nur Leads MIT Website). */
export interface TinderCard {
  id: string;
  company_name: string;
  website: string;
  rating: TrafficLightRating | null;
  reason: string | null;
}

/**
 * Reserviert dem aktuellen Nutzer einen disjunkten Batch — bis PER_RATING je
 * Ampel-Kategorie (gruen/orange/rot/unbewertet) — und gibt ihn zurueck. Atomar via
 * RPC (FOR UPDATE SKIP LOCKED) → zwei Nutzer greifen nie denselben Lead. Erneuter
 * Aufruf verlaengert die eigenen Claims und fuellt auf — auch fuer „Weitere laden".
 */
export async function claimQualifyBatch(): Promise<QualifyClaim[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const db = createServiceClient();
  const { data, error } = await db.rpc("claim_qualify_leads", {
    p_user: user.id,
    p_per_rating: PER_RATING,
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
 * Wie `claimQualifyBatch`, aber fuer die mobile Lead-Tinder-Ansicht: reserviert
 * denselben disjunkten Batch (teilt sich die Reservierung mit dem Desktop-Cockpit)
 * und liefert davon NUR die Leads MIT Website zurueck — anzeige-fertig (Name, URL,
 * Ampel, Begruendung). „Keine Website" wird damit billig server-seitig gefiltert;
 * den „blockiert/nicht einbettbar"-Fall prueft der Client zusaetzlich per
 * `/api/leads/[id]/embeddable`. Wird sowohl beim Initial-Load (RSC) als auch beim
 * Auto-Nachschub (Client) verwendet.
 */
export async function claimQualifyWebBatch(): Promise<TinderCard[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const db = createServiceClient();
  const { data: claimed, error: claimErr } = await db.rpc("claim_qualify_leads", {
    p_user: user.id,
    p_per_rating: PER_RATING,
    p_ttl_seconds: TTL_SECONDS,
  });

  // Erfolgsfall: nur die reservierten IDs nachladen, gefiltert auf vorhandene
  // Website. ids ist <= 4*PER_RATING (~200) → weit unter dem PostgREST-Inline-
  // Limit (~430). Reihenfolge wie die RPC: heisseste Ampel zuerst, id-Tiebreaker.
  if (!claimErr) {
    const ids = ((claimed as { id: string }[]) ?? []).map((r) => r.id);
    if (ids.length === 0) return [];
    const { data: rows, error: selErr } = await db
      .from("leads")
      .select("id, company_name, website, traffic_light_rating, traffic_light_reason")
      .in("id", ids)
      .not("website", "is", null)
      .neq("website", "")
      .order("traffic_light_score", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true });
    if (selErr) {
      console.error("[claimQualifyWebBatch] select:", selErr.message);
      return [];
    }
    return toTinderCards(rows as LeadCardRow[]);
  }

  // Fallback: die Reservierungs-RPC fehlt (Migration 127 nur teilweise eingespielt
  // — Tabelle ohne Funktion) → globale, website-gefilterte Queue laden (NICHT
  // reserviert), exakt wie das Cockpit auf `loadQueue` zurueckfaellt. So zeigt
  // Lead-Tinder auch ohne die RPC Leads. Gleiche Filter wie die Queue, zusaetzlich
  // „nur mit Website". Seitenweise, da PostgREST max 1000 Zeilen liefert.
  console.warn(
    "[claimQualifyWebBatch] claim RPC nicht verfuegbar, globaler Fallback:",
    claimErr.message,
  );
  const all: TinderCard[] = [];
  for (let offset = 0; offset < MAX_FALLBACK; offset += PAGE) {
    const { data: rows, error } = await db
      .from("leads")
      .select("id, company_name, website, traffic_light_rating, traffic_light_reason")
      .is("deleted_at", null)
      .is("crm_status_id", null)
      .not("status", "in", '("qualified","exported")')
      .eq("lifecycle_stage", "lead")
      .or("vertical.eq.webdesign,traffic_light_rating.not.is.null")
      .not("website", "is", null)
      .neq("website", "")
      .order("traffic_light_score", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.error("[claimQualifyWebBatch] fallback:", error.message);
      break;
    }
    all.push(...toTinderCards(rows as LeadCardRow[]));
    if ((rows?.length ?? 0) < PAGE) break; // letzte Seite erreicht
  }
  return all;
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
