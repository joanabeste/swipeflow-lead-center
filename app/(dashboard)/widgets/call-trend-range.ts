"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { toBerlinDayKey } from "@/lib/date/day-key";
import { loadCallStats } from "@/lib/calls/call-stats";

/**
 * Anruf-Trend + KPIs für einen frei gewählten Zeitraum (Von/Bis als
 * Kalendertage `YYYY-MM-DD`, Europe/Berlin). Anders als die 7/30/90-Presets
 * (die clientseitig aus den vorgeladenen 90 Tagen slicen) darf dieser Zeitraum
 * beliebig weit zurückreichen — deshalb serverseitiges Nachladen.
 */
export type CallTrendRange = {
  callsByDay: Array<{ date: string; outbound: number; inbound: number; missed: number; byUser: Record<string, number> }>;
  totals: { outbound: number; inbound: number; missed: number };
  appointmentsBooked: number;
  dealsCreated: number;
  dealsWon: number;
  wonCents: number;
};

const MAX_DAYS = 800; // Sicherheitslimit gegen versehentlich riesige Zeiträume.

export async function loadCallTrendRange(fromDate: string, toDate: string): Promise<CallTrendRange> {
  // Auth: nur eingeloggte Nutzer. Sicht = Team (wie das Dashboard-Widget selbst).
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Von/Bis normalisieren; falls vertauscht, tauschen.
  let from = fromDate;
  let to = toDate;
  if (from > to) [from, to] = [to, from];

  const db = createServiceClient();

  const dayKeys = berlinDayRange(from, to);
  const dayInRange = new Set(dayKeys);

  // Etwas großzügiger abfragen (Zeitzonen-/Randtage), danach exakt per
  // Berlin-Kalendertag filtern. So sind die Grenzen unabhängig von der
  // Server-Zeitzone (UTC) korrekt.
  const sinceMinusIso = new Date(new Date(from + "T00:00:00Z").getTime() - 2 * 24 * 3600_000).toISOString();
  const untilPlusIso = new Date(new Date(to + "T00:00:00Z").getTime() + 2 * 24 * 3600_000).toISOString();

  const [callStats, appts, dealsCreated, wonStages] = await Promise.all([
    loadCallStats(db, sinceMinusIso),
    // Termine nach Termin-Datum (scheduled_at), NICHT created_at (= DB-Insert-
    // Zeit, bei backfill-importierten Terminen für alle Zeilen identisch).
    // Bei fehlender Migration (133 lead_appointments) liefert PostgREST einen
    // Fehler statt zu werfen → `.data ?? []` ergibt 0 Termine (kein Crash).
    db.from("lead_appointments").select("scheduled_at, status").eq("status", "booked")
      .gte("scheduled_at", sinceMinusIso).lte("scheduled_at", untilPlusIso),
    db.from("deals").select("created_at").is("deleted_at", null)
      .gte("created_at", sinceMinusIso).lte("created_at", untilPlusIso),
    db.from("custom_lead_statuses").select("id").eq("is_deal_stage", true).eq("deal_kind", "won"),
  ]);

  // Anruf-Tagesbuckets (loadCallStats liefert bereits Berlin-Tage in r.day).
  const buckets: Record<string, { outbound: number; inbound: number; missed: number; byUser: Record<string, number> }> = {};
  for (const key of dayKeys) buckets[key] = { outbound: 0, inbound: 0, missed: 0, byUser: {} };
  for (const r of callStats) {
    const b = buckets[r.day];
    if (!b) continue;
    if (r.status === "missed") b.missed += r.cnt;
    else if (r.direction === "inbound") b.inbound += r.cnt;
    else b.outbound += r.cnt;
    if (r.created_by) b.byUser[r.created_by] = (b.byUser[r.created_by] ?? 0) + r.cnt;
  }
  const callsByDay = dayKeys.map((date) => ({ date, ...buckets[date] }));
  const totals = callsByDay.reduce(
    (acc, d) => ({
      outbound: acc.outbound + d.outbound,
      inbound: acc.inbound + d.inbound,
      missed: acc.missed + d.missed,
    }),
    { outbound: 0, inbound: 0, missed: 0 },
  );

  // Termine (nach Termin-Datum) im Zeitraum.
  let appointmentsBooked = 0;
  for (const a of (appts.data ?? []) as Array<{ scheduled_at: string | null }>) {
    if (a.scheduled_at && dayInRange.has(toBerlinDayKey(a.scheduled_at))) appointmentsBooked++;
  }

  // Erstellte Deals (nach created_at) im Zeitraum.
  let dealsCreatedCount = 0;
  for (const d of (dealsCreated.data ?? []) as Array<{ created_at: string }>) {
    if (dayInRange.has(toBerlinDayKey(d.created_at))) dealsCreatedCount++;
  }

  // Gewonnene Deals: actual_close_date ist ein date-Feld (ohne Zeit) → direkter
  // String-Vergleich gegen die Kalendergrenzen, keine Zeitzone nötig.
  const wonIds = ((wonStages.data ?? []) as Array<{ id: string }>).map((s) => s.id);
  let dealsWon = 0;
  let wonCents = 0;
  if (wonIds.length > 0) {
    const { data: won } = await db.from("deals").select("amount_cents")
      .in("stage_id", wonIds).is("deleted_at", null)
      .gte("actual_close_date", from).lte("actual_close_date", to);
    for (const d of (won ?? []) as Array<{ amount_cents: number | null }>) {
      dealsWon++;
      wonCents += d.amount_cents ?? 0;
    }
  }

  return { callsByDay, totals, appointmentsBooked, dealsCreated: dealsCreatedCount, dealsWon, wonCents };
}

/**
 * Kalendertage (Europe/Berlin) von `from` bis `to` inklusive. Iteriert um die
 * Tagesmitte (12:00 UTC), damit DST-Umstellungen den Tages-Key nicht
 * verschieben. Bei > MAX_DAYS wird abgeschnitten (Client bündelt ohnehin).
 */
function berlinDayRange(from: string, to: string): string[] {
  const keys: string[] = [];
  const end = new Date(to + "T12:00:00Z").getTime();
  let t = new Date(from + "T12:00:00Z").getTime();
  for (let i = 0; t <= end && i < MAX_DAYS; i++) {
    keys.push(toBerlinDayKey(new Date(t)));
    t += 24 * 3600_000;
  }
  return keys;
}
