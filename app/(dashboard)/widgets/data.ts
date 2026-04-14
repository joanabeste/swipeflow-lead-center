import { createServiceClient } from "@/lib/supabase/server";
import type { ServiceMode } from "@/lib/types";

/** Lädt einmal alle für Dashboard-Widgets nötigen Daten zentral. */
export async function loadDashboardData(userId: string, serviceMode: ServiceMode) {
  const db = createServiceClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();

  const baseQueries = [
    db.from("leads").select("*", { count: "exact", head: true }),
    db.from("leads").select("*", { count: "exact", head: true }).eq("status", "imported"),
    db.from("leads").select("*", { count: "exact", head: true }).eq("status", "enriched"),
    db.from("leads").select("*", { count: "exact", head: true }).eq("status", "enrichment_pending"),
    db.from("leads").select("*", { count: "exact", head: true }).eq("status", "qualified"),
    db.from("leads").select("*", { count: "exact", head: true }).eq("status", "exported"),
    db.from("leads").select("*", { count: "exact", head: true }).eq("status", "cancelled"),
    db.from("leads").select("*", { count: "exact", head: true }).eq("blacklist_hit", true),
    db.from("lead_enrichments").select("*", { count: "exact", head: true }).eq("status", "completed"),
    db.from("lead_enrichments").select("*", { count: "exact", head: true }).eq("status", "failed"),
    db.from("leads").select("id, company_name, status, updated_at").order("updated_at", { ascending: false }).limit(8),
    db.from("audit_logs").select("*, profiles(name)").order("created_at", { ascending: false }).limit(6),
    // CRM-Queue: alle Leads mit crm_status_id = todo
    db.from("leads").select("id, company_name, city, phone, crm_status_id, updated_at")
      .eq("status", "qualified")
      .eq("crm_status_id", "todo")
      .order("updated_at", { ascending: false })
      .limit(10),
    // Anrufe heute (alle User)
    db.from("lead_calls").select("id, lead_id, direction, status, started_at, phone_number, created_by, leads(company_name)")
      .gte("started_at", todayIso)
      .order("started_at", { ascending: false })
      .limit(20),
  ];

  const [
    totals, imported, enriched, enrichmentPending, qualified, exported, cancelled, filtered,
    enrichmentCompleted, enrichmentFailed, recentLeads, recentLogs, crmQueue, todaysCalls,
  ] = await Promise.all(baseQueries);

  // Webdev-spezifisch
  let noSslCount = 0, notMobileCount = 0, outdatedDesignCount = 0;
  if (serviceMode === "webdev") {
    const [{ count: noSsl }, { count: notMobile }, { count: outdated }] = await Promise.all([
      db.from("leads").select("*", { count: "exact", head: true }).eq("has_ssl", false),
      db.from("leads").select("*", { count: "exact", head: true }).eq("is_mobile_friendly", false),
      db.from("leads").select("*", { count: "exact", head: true }).eq("website_age_estimate", "veraltet"),
    ]);
    noSslCount = noSsl ?? 0;
    notMobileCount = notMobile ?? 0;
    outdatedDesignCount = outdated ?? 0;
  }

  // Namen für Call-Ersteller
  const callRows = (todaysCalls.data ?? []) as Array<{
    id: string; lead_id: string; direction: string; status: string;
    started_at: string; phone_number: string | null;
    created_by: string | null;
    leads: { company_name: string } | { company_name: string }[] | null;
  }>;
  const callUserIds = Array.from(new Set(callRows.map((c) => c.created_by).filter(Boolean))) as string[];
  const { data: callProfiles } = callUserIds.length > 0
    ? await db.from("profiles").select("id, name").in("id", callUserIds)
    : { data: [] as { id: string; name: string }[] };
  const callerNameById = new Map<string, string>();
  for (const p of callProfiles ?? []) callerNameById.set(p.id, p.name);

  return {
    counts: {
      total: totals.count ?? 0,
      imported: imported.count ?? 0,
      enriched: enriched.count ?? 0,
      enrichmentPending: enrichmentPending.count ?? 0,
      qualified: qualified.count ?? 0,
      exported: exported.count ?? 0,
      cancelled: cancelled.count ?? 0,
      filtered: filtered.count ?? 0,
      enrichmentCompleted: enrichmentCompleted.count ?? 0,
      enrichmentFailed: enrichmentFailed.count ?? 0,
      noSslCount, notMobileCount, outdatedDesignCount,
    },
    recentLeads: (recentLeads.data ?? []) as Array<{ id: string; company_name: string; status: string; updated_at: string }>,
    recentLogs: (recentLogs.data ?? []) as Array<{
      id: string; action: string; created_at: string;
      profiles: { name: string } | { name: string }[] | null;
    }>,
    crmQueue: (crmQueue.data ?? []) as Array<{
      id: string; company_name: string; city: string | null;
      phone: string | null; crm_status_id: string | null; updated_at: string;
    }>,
    todaysCalls: callRows.map((c) => ({
      ...c,
      companyName: Array.isArray(c.leads) ? c.leads[0]?.company_name ?? "" : c.leads?.company_name ?? "",
      callerName: c.created_by ? callerNameById.get(c.created_by) ?? null : null,
    })),
    userId,
    serviceMode,
  };
}

export type DashboardData = Awaited<ReturnType<typeof loadDashboardData>>;
