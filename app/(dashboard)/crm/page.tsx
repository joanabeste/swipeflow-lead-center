import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { CustomLeadStatus, Lead } from "@/lib/types";
import { CrmManager, type CrmLead } from "./crm-manager";

const PAGE_SIZE = 50;

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const db = createServiceClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const offset = (page - 1) * PAGE_SIZE;
  const sort = sp.sort ?? "updated_at";
  const order = (sp.order ?? "desc") as "asc" | "desc";

  const { data: statusRows } = await db
    .from("custom_lead_statuses")
    .select("*")
    .order("display_order", { ascending: true });
  const statuses = (statusRows ?? []) as CustomLeadStatus[];

  // Alle Leads mit mindestens einem Call
  const { data: calledRows } = await db
    .from("lead_calls")
    .select("lead_id")
    .limit(10000);
  const calledLeadIds = Array.from(new Set((calledRows ?? []).map((r) => r.lead_id)));

  // Recent-Calls für last_call-Filter
  async function fetchRecentCallLeadIds(sinceIso: string): Promise<string[]> {
    const { data } = await db
      .from("lead_calls")
      .select("lead_id")
      .gte("started_at", sinceIso)
      .limit(10000);
    return Array.from(new Set((data ?? []).map((r) => r.lead_id)));
  }

  // Alle Leads mit Notizen (für activity-Filter)
  const { data: notedRows } = await db.from("lead_notes").select("lead_id").limit(10000);
  const notedLeadIds = Array.from(new Set((notedRows ?? []).map((r) => r.lead_id)));

  let query = db
    .from("leads")
    .select("*", { count: "exact" })
    .is("deleted_at", null);

  // CRM-Scope: qualified ODER hat mind. einen Call
  if (calledLeadIds.length > 0) {
    query = query.or(`status.eq.qualified,id.in.(${calledLeadIds.join(",")})`);
  } else {
    query = query.eq("status", "qualified");
  }

  if (sp.crm_status) query = query.eq("crm_status_id", sp.crm_status);

  // Aktivitäts-Filter
  if (sp.activity === "called" && calledLeadIds.length > 0) {
    query = query.in("id", calledLeadIds);
  } else if (sp.activity === "uncalled") {
    if (calledLeadIds.length > 0) {
      query = query.not("id", "in", `(${calledLeadIds.join(",")})`);
    }
  } else if (sp.activity === "noted" && notedLeadIds.length > 0) {
    query = query.in("id", notedLeadIds);
  } else if (sp.activity === "unnoted") {
    if (notedLeadIds.length > 0) {
      query = query.not("id", "in", `(${notedLeadIds.join(",")})`);
    }
  }

  // Letzter-Anruf-Filter (Zeitfenster). Server Component → einmalig pro Request
  // gerendert, Date.now() hier pragmatisch OK.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  if (sp.last_call === "today") {
    const since = new Date(nowMs);
    since.setHours(0, 0, 0, 0);
    const recent = await fetchRecentCallLeadIds(since.toISOString());
    query = recent.length > 0 ? query.in("id", recent) : query.eq("id", "00000000-0000-0000-0000-000000000000");
  } else if (sp.last_call === "7d") {
    const since = new Date(nowMs - 7 * 86400_000);
    const recent = await fetchRecentCallLeadIds(since.toISOString());
    query = recent.length > 0 ? query.in("id", recent) : query.eq("id", "00000000-0000-0000-0000-000000000000");
  } else if (sp.last_call === "30d") {
    const since = new Date(nowMs - 30 * 86400_000);
    const recent = await fetchRecentCallLeadIds(since.toISOString());
    query = recent.length > 0 ? query.in("id", recent) : query.eq("id", "00000000-0000-0000-0000-000000000000");
  } else if (sp.last_call === "older_30d") {
    // in calledLeadIds ABER nicht in recent(30d)
    const recent = await fetchRecentCallLeadIds(new Date(nowMs - 30 * 86400_000).toISOString());
    const recentSet = new Set(recent);
    const older = calledLeadIds.filter((id) => !recentSet.has(id));
    query = older.length > 0 ? query.in("id", older) : query.eq("id", "00000000-0000-0000-0000-000000000000");
  } else if (sp.last_call === "never") {
    if (calledLeadIds.length > 0) {
      query = query.not("id", "in", `(${calledLeadIds.join(",")})`);
    }
  }

  if (sp.q) {
    const like = `%${sp.q}%`;
    query = query.or(`company_name.ilike.${like},domain.ilike.${like},city.ilike.${like}`);
  }

  // Spalten-Filter
  const columnFilters: Record<string, string> = {};
  for (const [key, value] of Object.entries(sp)) {
    if (key.startsWith("filter_") && value) {
      const col = key.replace("filter_", "");
      columnFilters[col] = value;
      query = query.ilike(col, `%${value}%`);
    }
  }

  const { data: leads, count } = await query
    .order(sort, { ascending: order === "asc" })
    .range(offset, offset + PAGE_SIZE - 1);

  const leadList = (leads ?? []) as Lead[];
  const leadIds = leadList.map((l) => l.id);

  const [{ data: callDetails }, { data: noteCounts }] = await Promise.all([
    leadIds.length
      ? db.from("lead_calls").select("lead_id, status, started_at").in("lead_id", leadIds)
      : Promise.resolve({ data: [] as { lead_id: string; status: string; started_at: string }[] }),
    leadIds.length
      ? db.from("lead_notes").select("lead_id").in("lead_id", leadIds)
      : Promise.resolve({ data: [] as { lead_id: string }[] }),
  ]);

  const callByLead = new Map<string, { count: number; lastAt: string | null }>();
  for (const c of callDetails ?? []) {
    const prev = callByLead.get(c.lead_id) ?? { count: 0, lastAt: null as string | null };
    const nextLast = !prev.lastAt || c.started_at > prev.lastAt ? c.started_at : prev.lastAt;
    callByLead.set(c.lead_id, { count: prev.count + 1, lastAt: nextLast });
  }
  const noteByLead = new Map<string, number>();
  for (const n of noteCounts ?? []) {
    noteByLead.set(n.lead_id, (noteByLead.get(n.lead_id) ?? 0) + 1);
  }

  const rows: CrmLead[] = leadList.map((l) => ({
    id: l.id,
    company_name: l.company_name,
    domain: l.domain,
    city: l.city,
    zip: l.zip,
    industry: l.industry,
    company_size: l.company_size,
    phone: l.phone,
    email: l.email,
    crm_status_id: l.crm_status_id,
    updated_at: l.updated_at,
    created_at: l.created_at,
    call_count: callByLead.get(l.id)?.count ?? 0,
    last_call_at: callByLead.get(l.id)?.lastAt ?? null,
    note_count: noteByLead.get(l.id) ?? 0,
  }));

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">CRM</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {count ?? 0} Lead{(count ?? 0) === 1 ? "" : "s"} in der Pipeline — hier
        anrufen, Notizen hinterlegen, Status pflegen.
      </p>

      <CrmManager
        leads={rows}
        statuses={statuses}
        totalPages={totalPages}
        currentPage={page}
        currentSort={sort}
        currentOrder={order}
        currentQuery={sp.q ?? ""}
        currentStatus={sp.crm_status ?? ""}
        currentActivity={sp.activity ?? ""}
        currentLastCall={sp.last_call ?? ""}
        currentFilters={columnFilters}
      />
    </div>
  );
}
