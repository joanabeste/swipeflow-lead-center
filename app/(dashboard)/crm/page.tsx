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

  // CRM-Scope: alle Leads mit status='qualified' ODER mindestens einem Anruf
  const { data: calledRows } = await db
    .from("lead_calls")
    .select("lead_id")
    .limit(5000);
  const calledLeadIds = Array.from(new Set((calledRows ?? []).map((r) => r.lead_id)));

  let query = db.from("leads").select("*", { count: "exact" });
  if (calledLeadIds.length > 0) {
    query = query.or(`status.eq.qualified,id.in.(${calledLeadIds.join(",")})`);
  } else {
    query = query.eq("status", "qualified");
  }

  if (sp.crm_status) query = query.eq("crm_status_id", sp.crm_status);
  if (sp.q) {
    const like = `%${sp.q}%`;
    query = query.or(`company_name.ilike.${like},domain.ilike.${like},city.ilike.${like}`);
  }

  // Spalten-Filter (filter_<col>=...)
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

  const [{ data: callCounts }, { data: noteCounts }] = await Promise.all([
    leadIds.length
      ? db.from("lead_calls").select("lead_id, status, started_at").in("lead_id", leadIds)
      : Promise.resolve({ data: [] as { lead_id: string; status: string; started_at: string }[] }),
    leadIds.length
      ? db.from("lead_notes").select("lead_id").in("lead_id", leadIds)
      : Promise.resolve({ data: [] as { lead_id: string }[] }),
  ]);

  const callByLead = new Map<string, { count: number; lastAt: string | null }>();
  for (const c of callCounts ?? []) {
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
        currentFilters={columnFilters}
      />
    </div>
  );
}
