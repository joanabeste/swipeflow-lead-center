import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { CustomLeadStatus, Lead } from "@/lib/types";
import { CrmManager, type CrmLead } from "./crm-manager";

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const db = createServiceClient();

  // User-Check (keine spezielle Rolle nötig, sonst Layout redirectet schon)
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: statusRows } = await db
    .from("custom_lead_statuses")
    .select("*")
    .order("display_order", { ascending: true });
  const statuses = (statusRows ?? []) as CustomLeadStatus[];

  // CRM-Scope: qualifiziert ODER hat mindestens einen Call.
  // Aus Performance-Gründen: erst alle lead_ids mit calls holen, dann ODER-Query bauen.
  const { data: calledRows } = await db
    .from("lead_calls")
    .select("lead_id")
    .limit(5000);
  const calledLeadIds = Array.from(new Set((calledRows ?? []).map((r) => r.lead_id)));

  let query = db
    .from("leads")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(500);

  if (calledLeadIds.length > 0) {
    query = query.or(`status.eq.qualified,id.in.(${calledLeadIds.join(",")})`);
  } else {
    query = query.eq("status", "qualified");
  }

  if (sp.status) query = query.eq("crm_status_id", sp.status);
  if (sp.q) {
    const like = `%${sp.q}%`;
    query = query.or(`company_name.ilike.${like},domain.ilike.${like},city.ilike.${like}`);
  }

  const { data: leads } = await query;
  const leadList = (leads ?? []) as Lead[];
  const leadIds = leadList.map((l) => l.id);

  // Zähler fürs Tabellen-UI
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
    industry: l.industry,
    company_size: l.company_size,
    phone: l.phone,
    email: l.email,
    crm_status_id: l.crm_status_id,
    updated_at: l.updated_at,
    call_count: callByLead.get(l.id)?.count ?? 0,
    last_call_at: callByLead.get(l.id)?.lastAt ?? null,
    note_count: noteByLead.get(l.id) ?? 0,
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">CRM</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Qualifizierte Leads und alle Leads mit Anrufhistorie — direkt hier anrufen, Notizen
        hinterlegen und Status pflegen.
      </p>

      <CrmManager leads={rows} statuses={statuses} selectedStatus={sp.status ?? null} query={sp.q ?? ""} />
    </div>
  );
}
