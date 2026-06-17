import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toBerlinDayKey } from "@/lib/date/day-key";

/**
 * Eine aggregierte Anruf-Zeile: Anzahl je Berlin-Kalendertag, Ersteller,
 * Richtung und Status. Daraus lassen sich alle Dashboard-Anrufkennzahlen
 * (heute / 7 Tage / 90 Tage, pro Person, pro Status) ableiten.
 */
export interface CallStatRow {
  day: string; // YYYY-MM-DD (Europe/Berlin)
  created_by: string | null;
  direction: string | null;
  status: string | null;
  cnt: number;
}

const PAGE = 1000;

/**
 * Lädt aggregierte Anruf-Statistiken seit `sinceIso`.
 *
 * Primär über die DB-seitige RPC `dashboard_call_stats` (Migration 125) — eine
 * GROUP-BY-Aggregation, die nur wenige Zeilen zurückgibt und damit das
 * PostgREST-Default-Limit von 1000 Zeilen (das die Anrufzahlen vorher still
 * gedeckelt hat) gar nicht erst berührt.
 *
 * Fallback (RPC noch nicht eingespielt): die Roh-Anrufe paginiert laden und in
 * JS in dieselbe Form gruppieren — korrekt, nur etwas langsamer. So ist das
 * Dashboard sofort richtig, auch vor der manuellen Migration.
 */
export async function loadCallStats(
  db: SupabaseClient,
  sinceIso: string,
): Promise<CallStatRow[]> {
  const { data, error } = await db.rpc("dashboard_call_stats", { p_since: sinceIso });
  if (!error && Array.isArray(data)) {
    return (data as Array<{
      day: string;
      created_by: string | null;
      direction: string | null;
      status: string | null;
      cnt: number | string;
    }>).map((r) => ({
      day: r.day,
      created_by: r.created_by,
      direction: r.direction,
      status: r.status,
      cnt: Number(r.cnt) || 0,
    }));
  }
  return aggregateRawCalls(await fetchCallsSince(db, sinceIso));
}

/** Paginiertes Roh-Laden (umgeht das 1000-Zeilen-Limit) — stabil über id. */
async function fetchCallsSince(
  db: SupabaseClient,
  sinceIso: string,
): Promise<Array<{ created_by: string | null; direction: string | null; status: string | null; started_at: string }>> {
  const all: Array<{ created_by: string | null; direction: string | null; status: string | null; started_at: string }> = [];
  let from = 0;
  for (;;) {
    const { data, error } = await db
      .from("lead_calls")
      .select("created_by, direction, status, started_at")
      .gte("started_at", sinceIso)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...(data as typeof all));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

/** Gruppiert Roh-Anrufe in dieselbe Form wie die RPC (Berlin-Tag/Ersteller/Richtung/Status). */
function aggregateRawCalls(
  rows: Array<{ created_by: string | null; direction: string | null; status: string | null; started_at: string }>,
): CallStatRow[] {
  const map = new Map<string, CallStatRow>();
  for (const c of rows) {
    const day = toBerlinDayKey(c.started_at);
    const key = `${day}|${c.created_by ?? ""}|${c.direction ?? ""}|${c.status ?? ""}`;
    const cur = map.get(key);
    if (cur) cur.cnt++;
    else map.set(key, { day, created_by: c.created_by, direction: c.direction, status: c.status, cnt: 1 });
  }
  return Array.from(map.values());
}
