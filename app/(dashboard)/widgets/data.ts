import { createServiceClient } from "@/lib/supabase/server";
import type { ServiceMode } from "@/lib/types";

/** Lädt einmal alle für Dashboard-Widgets nötigen Daten zentral. */
export async function loadDashboardData(userId: string, serviceMode: ServiceMode) {
  const db = createServiceClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600_000);
  sevenDaysAgo.setHours(0, 0, 0, 0);
  const sevenDaysIso = sevenDaysAgo.toISOString();

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

  const sevenDaysAgoIsoForFollowup = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();

  // Zusatz-Daten für neue Widgets (parallel, nur einmal)
  const [
    myCallsToday, myNotesToday, myCrmTodos,
    calls7d, enrichments7d, crmStatusDistRaw, customStatuses,
    // Neue Widgets:
    followupCandidates, teamCallsToday, openDealsRaw, dealStages, emails7d,
  ] = await Promise.all([
    db.from("lead_calls").select("*", { count: "exact", head: true })
      .eq("created_by", userId).gte("started_at", todayIso),
    db.from("lead_notes").select("*", { count: "exact", head: true })
      .eq("created_by", userId).gte("created_at", todayIso),
    db.from("leads").select("*", { count: "exact", head: true })
      .eq("status", "qualified").eq("crm_status_id", "todo"),
    db.from("lead_calls").select("direction, status, started_at")
      .gte("started_at", sevenDaysIso),
    db.from("lead_enrichments").select("status, created_at")
      .gte("created_at", sevenDaysIso),
    db.from("leads").select("crm_status_id")
      .eq("status", "qualified"),
    db.from("custom_lead_statuses").select("id, label, color, display_order")
      .eq("is_active", true).order("display_order", { ascending: true }),
    // Follow-Up: qualifizierte Leads mit CRM-Status "todo", die länger als
    // 7 Tage nicht angerufen wurden (oder noch nie). Wir holen einen größeren
    // Pool und filtern clientseitig mit der Call-Historie.
    db.from("leads").select("id, company_name, city, phone, updated_at")
      .eq("status", "qualified").eq("crm_status_id", "todo")
      .order("updated_at", { ascending: true }).limit(50),
    // Team-Leaderboard heute: alle Calls heute mit Ersteller.
    db.from("lead_calls").select("created_by, direction, status, started_at")
      .gte("started_at", todayIso),
    // Offene Deals gruppiert nach Stage (open kind), mit Amount.
    db.from("deals").select("stage_id, amount_cents"),
    db.from("deal_stages").select("id, label, color, kind, display_order")
      .eq("is_active", true).order("display_order", { ascending: true }),
    // E-Mails 7 Tage: sent/failed pro Tag.
    db.from("email_messages").select("status, sent_at")
      .gte("sent_at", sevenDaysIso),
  ]);

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

  // Calls 7d — aggregiere pro Tag
  const dayBuckets: Record<string, { outbound: number; inbound: number; missed: number }> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600_000);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    dayBuckets[key] = { outbound: 0, inbound: 0, missed: 0 };
  }
  for (const c of (calls7d.data ?? []) as Array<{ direction: string; status: string; started_at: string }>) {
    const key = c.started_at.slice(0, 10);
    if (!dayBuckets[key]) continue;
    if (c.status === "missed") dayBuckets[key].missed++;
    else if (c.direction === "inbound") dayBuckets[key].inbound++;
    else dayBuckets[key].outbound++;
  }
  const callsByDay = Object.entries(dayBuckets).map(([date, v]) => ({ date, ...v }));
  const callsTotal7d = callsByDay.reduce((s, d) => s + d.outbound + d.inbound + d.missed, 0);

  // Enrichments 7d
  const enrichBuckets: Record<string, { completed: number; failed: number }> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600_000);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    enrichBuckets[key] = { completed: 0, failed: 0 };
  }
  for (const e of (enrichments7d.data ?? []) as Array<{ status: string; created_at: string }>) {
    const key = e.created_at.slice(0, 10);
    if (!enrichBuckets[key]) continue;
    if (e.status === "completed") enrichBuckets[key].completed++;
    else if (e.status === "failed") enrichBuckets[key].failed++;
  }
  const enrichmentsByDay = Object.entries(enrichBuckets).map(([date, v]) => ({ date, ...v }));

  // CRM-Status-Verteilung: qualifizierte Leads nach crm_status_id gruppieren
  const crmDistCounts = new Map<string, number>();
  for (const row of (crmStatusDistRaw.data ?? []) as Array<{ crm_status_id: string | null }>) {
    const k = row.crm_status_id ?? "__none__";
    crmDistCounts.set(k, (crmDistCounts.get(k) ?? 0) + 1);
  }
  const crmStatusDistribution = ((customStatuses.data ?? []) as Array<{
    id: string; label: string; color: string; display_order: number;
  }>).map((s) => ({ id: s.id, label: s.label, color: s.color, count: crmDistCounts.get(s.id) ?? 0 }));

  // Follow-Up-Reminder: aus den Kandidaten die aussortieren, die in den
  // letzten 7 Tagen angerufen wurden. Dazu letzten Call pro Lead holen.
  const followupLeadIds = ((followupCandidates.data ?? []) as Array<{ id: string }>).map((l) => l.id);
  const followupLastCallByLead = new Map<string, string>();
  if (followupLeadIds.length > 0) {
    const { data: callsForFollowup } = await db
      .from("lead_calls")
      .select("lead_id, started_at")
      .in("lead_id", followupLeadIds)
      .order("started_at", { ascending: false });
    for (const c of (callsForFollowup ?? []) as Array<{ lead_id: string; started_at: string }>) {
      if (!followupLastCallByLead.has(c.lead_id)) {
        followupLastCallByLead.set(c.lead_id, c.started_at);
      }
    }
  }
  const nowMs = Date.now();
  const followUpReminders = ((followupCandidates.data ?? []) as Array<{
    id: string; company_name: string; city: string | null;
    phone: string | null; updated_at: string;
  }>)
    .map((l) => {
      const lastCallAt = followupLastCallByLead.get(l.id) ?? null;
      const daysSince = lastCallAt
        ? Math.floor((nowMs - new Date(lastCallAt).getTime()) / (24 * 3600_000))
        : null;
      return { ...l, lastCallAt, daysSince };
    })
    .filter((l) => !l.lastCallAt || l.lastCallAt < sevenDaysAgoIsoForFollowup)
    .slice(0, 8);

  // Team-Leaderboard heute: Anrufe pro User.
  const teamCallsRows = (teamCallsToday.data ?? []) as Array<{
    created_by: string | null; direction: string; status: string; started_at: string;
  }>;
  const leaderboardAgg = new Map<string, { total: number; answered: number }>();
  for (const c of teamCallsRows) {
    if (!c.created_by) continue;
    const cur = leaderboardAgg.get(c.created_by) ?? { total: 0, answered: 0 };
    cur.total++;
    if (c.status === "answered") cur.answered++;
    leaderboardAgg.set(c.created_by, cur);
  }
  const leaderboardUserIds = Array.from(leaderboardAgg.keys());
  const leaderboardNames = new Map<string, string>();
  if (leaderboardUserIds.length > 0) {
    const { data: lbProfiles } = await db
      .from("profiles")
      .select("id, name, email")
      .in("id", leaderboardUserIds);
    for (const p of (lbProfiles ?? []) as Array<{ id: string; name: string | null; email: string | null }>) {
      leaderboardNames.set(p.id, p.name ?? p.email ?? "Unbekannt");
    }
  }
  const teamLeaderboard = leaderboardUserIds
    .map((id) => ({
      userId: id,
      name: leaderboardNames.get(id) ?? "Unbekannt",
      total: leaderboardAgg.get(id)!.total,
      answered: leaderboardAgg.get(id)!.answered,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // Deal-Summary: nur open-stages zählen + Amount summieren.
  const stagesRows = (dealStages.data ?? []) as Array<{
    id: string; label: string; color: string; kind: string; display_order: number;
  }>;
  const openStages = stagesRows.filter((s) => s.kind === "open");
  const dealsAggByStage = new Map<string, { count: number; amountCents: number }>();
  for (const d of (openDealsRaw.data ?? []) as Array<{ stage_id: string; amount_cents: number }>) {
    const cur = dealsAggByStage.get(d.stage_id) ?? { count: 0, amountCents: 0 };
    cur.count++;
    cur.amountCents += d.amount_cents ?? 0;
    dealsAggByStage.set(d.stage_id, cur);
  }
  const dealSummary = openStages.map((s) => ({
    id: s.id,
    label: s.label,
    color: s.color,
    count: dealsAggByStage.get(s.id)?.count ?? 0,
    amountCents: dealsAggByStage.get(s.id)?.amountCents ?? 0,
  }));
  const dealTotals = dealSummary.reduce(
    (acc, s) => ({ count: acc.count + s.count, amountCents: acc.amountCents + s.amountCents }),
    { count: 0, amountCents: 0 },
  );

  // E-Mail-Performance 7d: sent/failed pro Tag.
  const emailBuckets: Record<string, { sent: number; failed: number }> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600_000);
    d.setHours(0, 0, 0, 0);
    emailBuckets[d.toISOString().slice(0, 10)] = { sent: 0, failed: 0 };
  }
  let emailsSent7d = 0;
  let emailsFailed7d = 0;
  for (const e of (emails7d.data ?? []) as Array<{ status: string; sent_at: string }>) {
    const key = e.sent_at.slice(0, 10);
    if (!emailBuckets[key]) continue;
    if (e.status === "sent") { emailBuckets[key].sent++; emailsSent7d++; }
    else if (e.status === "failed") { emailBuckets[key].failed++; emailsFailed7d++; }
  }
  const emailsByDay = Object.entries(emailBuckets).map(([date, v]) => ({ date, ...v }));

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
    myDay: {
      callsToday: myCallsToday.count ?? 0,
      notesToday: myNotesToday.count ?? 0,
      openTodos: myCrmTodos.count ?? 0,
    },
    callsByDay,
    callsTotal7d,
    enrichmentsByDay,
    crmStatusDistribution,
    followUpReminders,
    teamLeaderboard,
    dealSummary,
    dealTotals,
    emailsByDay,
    emailsSent7d,
    emailsFailed7d,
    userId,
    serviceMode,
  };
}

export type DashboardData = Awaited<ReturnType<typeof loadDashboardData>>;
