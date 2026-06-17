import { createClient } from "@/lib/supabase/server";
import type { CustomLeadStatus, TrafficLightRating } from "@/lib/types";
import { getQualifyHotkeySettings } from "@/lib/app-settings";
import { QualifyCockpit } from "./qualify-cockpit";

// PostgREST liefert max. 1000 Zeilen pro Request → wir paginieren, damit WIRKLICH
// alle Leads in der Queue landen (und die Filter-Zähler stimmen). Sicherheits-
// Obergrenze gegen Ausreißer; bei Überschreitung wird gewarnt.
const PAGE = 1000;
const MAX_QUEUE = 6000;

type QueueRow = { id: string; rating: TrafficLightRating | null };

/**
 * Lädt ALLE qualifizierbaren Webdesign-Leads (nur id + Ampel) seitenweise.
 *
 * Filter identisch zu „Neue Leads", zusätzlich auf Webdesign-Leads beschränkt.
 * „Webdesign" = gleiche Heuristik wie die Schnellansicht (lead-preview-drawer):
 * `vertical='webdesign'` ODER es liegt eine Ampel-Bewertung vor (die Spalte
 * `vertical` ist im Bestand oft NULL). Sortierung: heißeste (grüne) Ampel zuerst,
 * stabiler id-Tiebreaker für konsistente Seiten.
 */
async function loadQueue(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<QueueRow[]> {
  const all: QueueRow[] = [];
  for (let offset = 0; offset < MAX_QUEUE; offset += PAGE) {
    const { data, error } = await supabase
      .from("leads")
      .select("id, traffic_light_rating")
      .is("deleted_at", null)
      .is("crm_status_id", null)
      .not("status", "in", '("qualified","exported")')
      .eq("lifecycle_stage", "lead")
      .or("vertical.eq.webdesign,traffic_light_rating.not.is.null")
      .order("traffic_light_score", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.error("[qualifizieren] loadQueue:", error.message);
      break;
    }
    const rows = data ?? [];
    for (const r of rows) {
      all.push({
        id: r.id as string,
        rating: (r.traffic_light_rating as TrafficLightRating | null) ?? null,
      });
    }
    if (rows.length < PAGE) break; // letzte Seite erreicht
  }
  if (all.length >= MAX_QUEUE) {
    console.warn(`[qualifizieren] Queue auf ${MAX_QUEUE} gekappt — es gibt evtl. mehr Leads.`);
  }
  return all;
}

/**
 * Vollbild-Qualifizierungs-Cockpit für neue Webdesign-Leads. Baut serverseitig
 * nur die Reihenfolge (id + Ampel); Detaildaten je Lead lädt der Client lazy
 * über `/api/leads/[id]/preview` (gleiches Bundle wie die Schnellansicht).
 */
export default async function QualifizierenPage() {
  const supabase = await createClient();

  const [queue, { data: statuses }, settings] = await Promise.all([
    loadQueue(supabase),
    supabase
      .from("custom_lead_statuses")
      .select("*")
      .eq("is_active", true)
      .eq("is_archived", false)
      .order("display_order", { ascending: true }),
    getQualifyHotkeySettings(),
  ]);

  // Nur Webdesign-relevante bzw. vertikal-agnostische Status als Qualifizier-Ziel.
  const targetStatuses = ((statuses as CustomLeadStatus[]) ?? []).filter(
    (s) => s.vertical === "webdesign" || s.vertical == null,
  );

  return (
    <QualifyCockpit
      queue={queue}
      statuses={targetStatuses}
      initialSettings={settings}
    />
  );
}
