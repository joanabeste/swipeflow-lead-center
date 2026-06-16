import "server-only";
import { startOfDayInAppTz } from "@/lib/zeit/timezone";
import { createServiceClient } from "@/lib/supabase/server";

/** Seitengröße für die „Heutige Anrufe"-Liste (Dashboard-Widget + API). */
export const TODAY_CALLS_PAGE_SIZE = 20;

/** Eine Zeile der heutigen Anrufliste — server-aufgelöst (Firma + Anrufer-Name). */
export interface TodayCallListItem {
  id: string;
  lead_id: string;
  direction: string;
  status: string;
  started_at: string;
  companyName: string;
  callerName: string | null;
}

type Db = ReturnType<typeof createServiceClient>;

interface CallRow {
  id: string;
  lead_id: string;
  direction: string;
  status: string;
  started_at: string;
  created_by: string | null;
  leads: { company_name: string } | { company_name: string }[] | null;
}

/**
 * Lädt eine (paginierte) Seite der heutigen Anrufe (alle Nutzer, ab 00:00 Berlin)
 * inkl. Firmenname und aufgelöstem Anrufer-Namen. Wird vom Dashboard-Loader
 * (erste Seite) und der Pagination-API (`/api/calls/today`) genutzt.
 */
export async function loadTodaysCalls(
  db: Db,
  opts: { offset?: number; limit?: number } = {},
): Promise<TodayCallListItem[]> {
  const offset = Math.max(0, opts.offset ?? 0);
  const limit = Math.max(1, opts.limit ?? TODAY_CALLS_PAGE_SIZE);
  const todayIso = startOfDayInAppTz().toISOString();

  const { data } = await db
    .from("lead_calls")
    .select("id, lead_id, direction, status, started_at, created_by, leads(company_name)")
    .gte("started_at", todayIso)
    .order("started_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const rows = (data ?? []) as CallRow[];

  // Anrufer-Namen auflösen (created_by → profiles).
  const userIds = Array.from(new Set(rows.map((r) => r.created_by).filter(Boolean))) as string[];
  const { data: profiles } = userIds.length > 0
    ? await db.from("profiles").select("id, name").in("id", userIds)
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map<string, string>();
  for (const p of profiles ?? []) nameById.set(p.id as string, p.name as string);

  return rows.map((r) => ({
    id: r.id,
    lead_id: r.lead_id,
    direction: r.direction,
    status: r.status,
    started_at: r.started_at,
    companyName: Array.isArray(r.leads) ? r.leads[0]?.company_name ?? "" : r.leads?.company_name ?? "",
    callerName: r.created_by ? nameById.get(r.created_by) ?? null : null,
  }));
}
