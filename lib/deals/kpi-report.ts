import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import { toBerlinDayKey } from "@/lib/date/day-key";
import { permissionsFromProfile, type Profile } from "@/lib/types";

/**
 * Monatlicher Sales-KPI-Report für die PDF-Ausgabe.
 *
 * Daten-Realität (bewusst so entschieden, siehe Plan):
 * - Nur `leads.vertical` trägt Recruiting/Webentwicklung. Deals, Anrufe und
 *   Termine werden ausschließlich über den verknüpften Lead zugeordnet
 *   (`lead_id → leads.vertical`). Was sich nicht zuordnen lässt (Lead ohne
 *   Vertical / `sonstiges`, Deal ohne `lead_id`), zählt nur in `total`, nicht
 *   je Vertical → deshalb ist recruiting + webdesign ≤ total (Fußnote im PDF).
 * - „Anwahl" = jede ausgehende `lead_calls`-Zeile, unabhängig vom Status.
 * - „Setting Termin pro Mitarbeiter" wird heuristisch dem Vertriebler
 *   zugeordnet, der den Lead zuletzt vor der Buchung ausgehend angerufen hat.
 */

export type VerticalKey = "recruiting" | "webdesign";

export interface KpiTotals {
  anwahlen: number;
  settingTermine: number;
  closingTermine: number;
  closings: number;
  closingVolumeCents: number;
}

export interface RepRow {
  id: string;
  name: string;
  anwahlen: number;
  settingTermine: number;
  closings: number;
  closingVolumeCents: number;
}

export interface SalesKpiReport {
  month: string; // YYYY-MM
  monthLabel: string; // z. B. "Juli 2026"
  repCount: number; // aktive Vertriebler (can_vertrieb)
  anwahlenProKopf: number; // total.anwahlen / repCount (gerundet auf 1 Stelle)
  total: KpiTotals;
  byVertical: Record<VerticalKey, KpiTotals>;
  unassigned: KpiTotals; // nur-in-total-Rest (für die Fußnote)
  reps: RepRow[]; // absteigend nach Anwahlen
  callsPerDay: Array<{ date: string; count: number }>; // Berlin-Tage des Monats
}

const PAGE = 1000;
const DAY_MS = 24 * 3600_000;

/** Leerer KPI-Block. */
function emptyTotals(): KpiTotals {
  return { anwahlen: 0, settingTermine: 0, closingTermine: 0, closings: 0, closingVolumeCents: 0 };
}

/** Vertical eines Leads → Bucket-Key oder null (nicht zuordenbar). */
function verticalOf(vertical: string | null | undefined): VerticalKey | null {
  if (vertical === "recruiting") return "recruiting";
  if (vertical === "webdesign") return "webdesign";
  return null;
}

/**
 * Lädt alle Kennzahlen für den Monat `YYYY-MM` (Europe/Berlin). Service-Client:
 * die Auth erfolgt im Route-Handler.
 */
export async function loadSalesKpiReport(month: string): Promise<SalesKpiReport> {
  const db = createServiceClient();

  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIdx = Number(monthStr) - 1; // 0-basiert
  const lastDom = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
  const firstDay = `${month}-01`;
  const lastDay = `${month}-${String(lastDom).padStart(2, "0")}`;
  const monthLabel = new Date(Date.UTC(year, monthIdx, 15)).toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/Berlin",
  });

  // Berlin-Kalendertage des Monats (für Anwahlen-Tagesreihe & Filter).
  const monthDayKeys: string[] = [];
  for (let d = 1; d <= lastDom; d++) monthDayKeys.push(`${month}-${String(d).padStart(2, "0")}`);
  const monthDaySet = new Set(monthDayKeys);

  // Zeitfenster mit Puffer (Zeitzonen-Randtage); Anrufe zusätzlich mit
  // Rückblick, damit die Setter-Heuristik auch Calls vor Monatsbeginn sieht.
  const monthStartMs = new Date(firstDay + "T00:00:00Z").getTime();
  const monthEndMs = new Date(lastDay + "T00:00:00Z").getTime();
  const sinceMinusIso = new Date(monthStartMs - 2 * DAY_MS).toISOString();
  const untilPlusIso = new Date(monthEndMs + 2 * DAY_MS).toISOString();
  const callLookbackIso = new Date(monthStartMs - 60 * DAY_MS).toISOString();

  // Won-Deal-Stages (deal_kind='won').
  const { data: wonStageRows } = await db
    .from("custom_lead_statuses")
    .select("id")
    .eq("is_deal_stage", true)
    .eq("deal_kind", "won");
  const wonIds = (wonStageRows ?? []).map((s) => (s as { id: string }).id);

  const [profiles, mappingRows, outboundCalls, appointments, wonDeals] = await Promise.all([
    db
      .from("profiles")
      .select("id, name, role, status, can_vertrieb, can_fulfillment, can_zeit, can_learning, can_vertraege")
      .eq("status", "active"),
    db.from("calendly_event_mappings").select("event_type_uri, booked_status_id"),
    fetchPaged<OutboundCall>(db, (from) =>
      db
        .from("lead_calls")
        .select("created_by, started_at, lead_id, lead:leads(vertical)")
        .eq("direction", "outbound")
        .gte("started_at", callLookbackIso)
        .lte("started_at", untilPlusIso)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1),
    ),
    fetchPaged<AppointmentRow>(db, (from) =>
      db
        .from("lead_appointments")
        // Abgrenzung nach `scheduled_at` (Termin-Datum), NICHT `created_at`:
        // `created_at` ist die DB-Insert-Zeit und bei backfill-importierten
        // Terminen für alle Zeilen identisch → für Monatszahlen unbrauchbar.
        .select("scheduled_at, event_type_uri, lead_id, lead:leads(vertical)")
        .eq("status", "booked")
        .gte("scheduled_at", sinceMinusIso)
        .lte("scheduled_at", untilPlusIso)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1),
    ),
    wonIds.length > 0
      ? fetchPaged<WonDealRow>(db, (from) =>
          db
            .from("deals")
            .select("amount_cents, assigned_to, actual_close_date, lead:leads(vertical)")
            .in("stage_id", wonIds)
            .is("deleted_at", null)
            .gte("actual_close_date", firstDay)
            .lte("actual_close_date", lastDay)
            .order("id", { ascending: true })
            .range(from, from + PAGE - 1),
        )
      : Promise.resolve([] as WonDealRow[]),
  ]);

  // Namen aller aktiven Profile (für die Mitarbeiter-Tabelle).
  const nameById = new Map<string, string>();
  const rosterIds = new Set<string>();
  for (const p of (profiles.data ?? []) as Profile[]) {
    nameById.set(p.id, p.name || "Ohne Name");
    if (permissionsFromProfile(p).can_vertrieb) rosterIds.add(p.id);
  }

  // event_type_uri → Closing? (booked_status_id === 'closing-termin-gelegt').
  const closingEventUris = new Set<string>();
  for (const m of (mappingRows.data ?? []) as Array<{ event_type_uri: string; booked_status_id: string | null }>) {
    if (m.booked_status_id === "closing-termin-gelegt") closingEventUris.add(m.event_type_uri);
  }

  const total = emptyTotals();
  const byVertical: Record<VerticalKey, KpiTotals> = {
    recruiting: emptyTotals(),
    webdesign: emptyTotals(),
  };
  const unassigned = emptyTotals();
  const repAgg = new Map<string, RepRow>();
  const dayCount = new Map<string, number>(monthDayKeys.map((d) => [d, 0]));

  const rep = (id: string | null): RepRow | null => {
    if (!id) return null;
    let row = repAgg.get(id);
    if (!row) {
      row = { id, name: nameById.get(id) ?? "Unbekannt", anwahlen: 0, settingTermine: 0, closings: 0, closingVolumeCents: 0 };
      repAgg.set(id, row);
    }
    return row;
  };
  const addVertical = (v: VerticalKey | null, apply: (t: KpiTotals) => void) => {
    apply(total);
    if (v) apply(byVertical[v]);
    else apply(unassigned);
  };

  // ---- Anwahlen (nur Calls im Monat; Lookback-Calls dienen nur der Heuristik).
  const monthCalls: OutboundCall[] = [];
  for (const c of outboundCalls) {
    const day = toBerlinDayKey(c.started_at);
    if (!monthDaySet.has(day)) continue;
    monthCalls.push(c);
    const v = verticalOf(c.lead?.vertical);
    addVertical(v, (t) => (t.anwahlen += 1));
    dayCount.set(day, (dayCount.get(day) ?? 0) + 1);
    const r = rep(c.created_by);
    if (r) r.anwahlen += 1;
  }

  // ---- Setter-Heuristik: letzter ausgehender Call je Lead vor Buchung.
  // Calls je Lead nach started_at sortiert (aufsteigend).
  const callsByLead = new Map<string, OutboundCall[]>();
  for (const c of outboundCalls) {
    if (!c.lead_id) continue;
    const list = callsByLead.get(c.lead_id);
    if (list) list.push(c);
    else callsByLead.set(c.lead_id, [c]);
  }
  for (const list of callsByLead.values()) {
    list.sort((a, b) => a.started_at.localeCompare(b.started_at));
  }
  const lastCallerBefore = (leadId: string | null, beforeIso: string): string | null => {
    if (!leadId) return null;
    const list = callsByLead.get(leadId);
    if (!list) return null;
    let caller: string | null = null;
    for (const c of list) {
      if (c.started_at <= beforeIso) {
        if (c.created_by) caller = c.created_by;
      } else break;
    }
    return caller;
  };

  // ---- Termine (Setting vs. Closing) im Monat nach Termin-Datum (scheduled_at).
  for (const a of appointments) {
    if (!a.scheduled_at) continue; // ohne Termin-Datum nicht einordenbar
    if (!monthDaySet.has(toBerlinDayKey(a.scheduled_at))) continue;
    const isClosing = a.event_type_uri ? closingEventUris.has(a.event_type_uri) : false;
    const v = verticalOf(a.lead?.vertical);
    if (isClosing) {
      addVertical(v, (t) => (t.closingTermine += 1));
    } else {
      addVertical(v, (t) => (t.settingTermine += 1));
      // Setter = letzter ausgehender Anrufer des Leads vor dem Termin.
      const setterId = lastCallerBefore(a.lead_id, a.scheduled_at);
      const r = rep(setterId);
      if (r) r.settingTermine += 1;
    }
  }

  // ---- Closings (gewonnene Deals im Monat nach actual_close_date).
  for (const d of wonDeals) {
    const v = verticalOf(d.lead?.vertical);
    const cents = d.amount_cents ?? 0;
    addVertical(v, (t) => {
      t.closings += 1;
      t.closingVolumeCents += cents;
    });
    const r = rep(d.assigned_to);
    if (r) {
      r.closings += 1;
      r.closingVolumeCents += cents;
    }
  }

  // Mitarbeiter-Tabelle: Roster zuerst (auch ohne Aktivität), dann sonstige
  // Aktive mit Aktivität; absteigend nach Anwahlen.
  for (const id of rosterIds) rep(id); // sicherstellen, dass jeder Vertriebler eine Zeile hat
  const reps = Array.from(repAgg.values())
    .filter((r) => rosterIds.has(r.id) || r.anwahlen > 0 || r.settingTermine > 0 || r.closings > 0)
    .sort((a, b) => b.anwahlen - a.anwahlen || b.closings - a.closings || a.name.localeCompare(b.name));

  const callsPerDay = monthDayKeys.map((date) => ({ date, count: dayCount.get(date) ?? 0 }));
  const repCount = rosterIds.size;
  const anwahlenProKopf = repCount > 0 ? Math.round((total.anwahlen / repCount) * 10) / 10 : 0;

  return {
    month,
    monthLabel,
    repCount,
    anwahlenProKopf,
    total,
    byVertical,
    unassigned,
    reps,
    callsPerDay,
  };
}

// ---- Roh-Zeilentypen (PostgREST-Embeds sind to-one → Objekt oder null). ----

interface LeadVerticalEmbed {
  vertical: string | null;
}
interface OutboundCall {
  created_by: string | null;
  started_at: string;
  lead_id: string | null;
  lead: LeadVerticalEmbed | null;
}
interface AppointmentRow {
  scheduled_at: string | null;
  event_type_uri: string | null;
  lead_id: string | null;
  lead: LeadVerticalEmbed | null;
}
interface WonDealRow {
  amount_cents: number | null;
  assigned_to: string | null;
  actual_close_date: string | null;
  lead: LeadVerticalEmbed | null;
}

/**
 * Lädt eine Query paginiert (umgeht das PostgREST-1000-Zeilen-Limit). `build`
 * bekommt den Offset und liefert die bereits mit `.range()` versehene Query.
 */
async function fetchPaged<T>(
  _db: SupabaseClient,
  build: (from: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await build(from);
    const rows = (Array.isArray(data) ? data : []) as T[];
    if (error || rows.length === 0) break;
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}
