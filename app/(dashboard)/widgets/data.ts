import { createServiceClient } from "@/lib/supabase/server";
import type { ServiceMode } from "@/lib/types";
import { toBerlinDayKey } from "@/lib/date/day-key";
import { MODE_TO_VERTICAL } from "@/lib/service-mode-constants";

/** Lädt einmal alle für Dashboard-Widgets nötigen Daten zentral. */
export async function loadDashboardData(userId: string, serviceMode: ServiceMode) {
  const db = createServiceClient();
  // Vertikale-Filter fuer alle „post-qualification" Queries. Top-of-Funnel
  // (totals, imported, enriched, enrichment_pending) bleibt unverteilt, weil
  // neue Leads beim Import noch keine Vertikale haben (vertical IS NULL).
  const vertical = MODE_TO_VERTICAL[serviceMode];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600_000);
  sevenDaysAgo.setHours(0, 0, 0, 0);
  const sevenDaysIso = sevenDaysAgo.toISOString();

  const baseQueries = [
    db.from("leads").select("*", { count: "exact", head: true }).is("deleted_at", null),
    db.from("leads").select("*", { count: "exact", head: true }).eq("status", "imported").is("deleted_at", null),
    db.from("leads").select("*", { count: "exact", head: true }).eq("status", "enriched").is("deleted_at", null),
    db.from("leads").select("*", { count: "exact", head: true }).eq("status", "enrichment_pending").is("deleted_at", null),
    db.from("leads").select("*", { count: "exact", head: true }).eq("status", "qualified").eq("vertical", vertical).is("deleted_at", null),
    db.from("leads").select("*", { count: "exact", head: true }).eq("status", "exported").eq("vertical", vertical).is("deleted_at", null),
    db.from("leads").select("*", { count: "exact", head: true }).eq("status", "cancelled").eq("vertical", vertical).is("deleted_at", null),
    db.from("leads").select("*", { count: "exact", head: true }).eq("blacklist_hit", true).is("deleted_at", null),
    db.from("lead_enrichments").select("*", { count: "exact", head: true }).eq("status", "completed"),
    db.from("lead_enrichments").select("*", { count: "exact", head: true }).eq("status", "failed"),
    db.from("leads").select("id, company_name, status, updated_at").eq("vertical", vertical).is("deleted_at", null).order("updated_at", { ascending: false }).limit(8),
    db.from("audit_logs").select("*, profiles(name)").order("created_at", { ascending: false }).limit(6),
    // CRM-Queue: alle Leads mit crm_status_id = todo (modeabhaengig)
    db.from("leads").select("id, company_name, city, phone, crm_status_id, updated_at")
      .eq("status", "qualified")
      .eq("crm_status_id", "todo")
      .eq("vertical", vertical)
      .is("deleted_at", null)
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
      db.from("leads").select("*", { count: "exact", head: true }).eq("has_ssl", false).eq("vertical", vertical).is("deleted_at", null),
      db.from("leads").select("*", { count: "exact", head: true }).eq("is_mobile_friendly", false).eq("vertical", vertical).is("deleted_at", null),
      db.from("leads").select("*", { count: "exact", head: true }).eq("website_age_estimate", "veraltet").eq("vertical", vertical).is("deleted_at", null),
    ]);
    noSslCount = noSsl ?? 0;
    notMobileCount = notMobile ?? 0;
    outdatedDesignCount = outdated ?? 0;
  }

  const sevenDaysAgoIsoForFollowup = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const ninetyDaysAgoIso = new Date(Date.now() - 90 * 24 * 3600_000).toISOString();
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
  twelveMonthsAgo.setDate(1);
  twelveMonthsAgo.setHours(0, 0, 0, 0);
  const twelveMonthsAgoIso = twelveMonthsAgo.toISOString().slice(0, 10);

  // Zusatz-Daten für neue Widgets (parallel, nur einmal)
  const [
    myCallsToday, myNotesToday, myCrmTodos,
    calls7d, enrichments7d, crmStatusDistRaw, customStatuses,
    // Neue Widgets:
    followupCandidates, teamCallsToday, openDealsRaw, dealStages, emails7d,
    calls90d, dealsClosed12m,
  ] = await Promise.all([
    db.from("lead_calls").select("*", { count: "exact", head: true })
      .eq("created_by", userId).gte("started_at", todayIso),
    db.from("lead_notes").select("*", { count: "exact", head: true })
      .eq("created_by", userId).gte("created_at", todayIso),
    db.from("leads").select("*", { count: "exact", head: true })
      .eq("status", "qualified").eq("crm_status_id", "todo").eq("vertical", vertical).is("deleted_at", null),
    db.from("lead_calls").select("direction, status, started_at")
      .gte("started_at", sevenDaysIso),
    db.from("lead_enrichments").select("status, created_at")
      .gte("created_at", sevenDaysIso),
    db.from("leads").select("crm_status_id")
      .eq("status", "qualified").eq("vertical", vertical).is("deleted_at", null),
    db.from("custom_lead_statuses").select("id, label, color, display_order, vertical")
      .eq("is_active", true).order("display_order", { ascending: true }),
    // Follow-Up: qualifizierte Leads mit CRM-Status "todo", die länger als
    // 7 Tage nicht angerufen wurden (oder noch nie). Wir holen einen größeren
    // Pool und filtern clientseitig mit der Call-Historie.
    db.from("leads").select("id, company_name, city, phone, updated_at")
      .eq("status", "qualified").eq("crm_status_id", "todo").eq("vertical", vertical).is("deleted_at", null)
      .order("updated_at", { ascending: true }).limit(50),
    // Team-Leaderboard heute: alle Calls heute mit Ersteller.
    db.from("lead_calls").select("created_by, direction, status, started_at")
      .gte("started_at", todayIso),
    // Offene Deals gruppiert nach Stage (open kind), mit Amount.
    db.from("deals").select("stage_id, amount_cents").is("deleted_at", null),
    db.from("deal_stages").select("id, label, color, kind, display_order")
      .eq("is_active", true).order("display_order", { ascending: true }),
    // E-Mails 7 Tage: sent/failed pro Tag.
    db.from("email_messages").select("status, sent_at")
      .gte("sent_at", sevenDaysIso),
    // Anrufe 90 Tage (für filterbares Trend-Widget + Pro-Nutzer-Statistik).
    db.from("lead_calls").select("created_by, direction, status, started_at")
      .gte("started_at", ninetyDaysAgoIso),
    // Abgeschlossene Deals der letzten 12 Monate (für Trend-Widget).
    db.from("deals").select("stage_id, amount_cents, actual_close_date")
      .gte("actual_close_date", twelveMonthsAgoIso)
      .not("actual_close_date", "is", null)
      .is("deleted_at", null),
  ]);

  // Offene Aufgaben (Wiedervorlagen) — für Dashboard-Widget.
  // Zeigt überfällige + heutige + nächste 7 Tage. Lead-Daten parallel via Lookup.
  const todayDateOnly = new Date(today).toISOString().slice(0, 10);
  const sevenDaysAheadKey = new Date(Date.now() + 7 * 24 * 3600_000).toISOString().slice(0, 10);
  const { data: openTodoRows } = await db
    .from("lead_todos")
    .select("id, lead_id, title, due_date")
    .is("done_at", null)
    .lte("due_date", sevenDaysAheadKey)
    .order("due_date", { ascending: true })
    .limit(50);
  type OpenTodo = { id: string; lead_id: string; title: string; due_date: string };
  const openTodos = (openTodoRows ?? []) as OpenTodo[];
  const todoLeadIds = Array.from(new Set(openTodos.map((t) => t.lead_id)));
  const { data: todoLeads } = todoLeadIds.length > 0
    ? await db.from("leads").select("id, company_name, city").in("id", todoLeadIds).is("deleted_at", null)
    : { data: [] as { id: string; company_name: string; city: string | null }[] };
  const todoLeadMap = new Map<string, { company_name: string; city: string | null }>();
  for (const l of (todoLeads ?? []) as Array<{ id: string; company_name: string; city: string | null }>) {
    todoLeadMap.set(l.id, { company_name: l.company_name, city: l.city });
  }
  const openTodoItems = openTodos
    .filter((t) => todoLeadMap.has(t.lead_id))   // gelöschte/archivierte Leads ausblenden
    .map((t) => {
      const lead = todoLeadMap.get(t.lead_id)!;
      const tone: "overdue" | "today" | "soon" =
        t.due_date < todayDateOnly ? "overdue" :
        t.due_date === todayDateOnly ? "today" : "soon";
      return {
        id: t.id,
        leadId: t.lead_id,
        title: t.title,
        dueDate: t.due_date,
        tone,
        company_name: lead.company_name,
        city: lead.city,
      };
    });

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

  // Calls 7d — aggregiere pro Tag in Berlin-Zeit (siehe day-key.ts)
  const dayBuckets: Record<string, { outbound: number; inbound: number; missed: number }> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600_000);
    dayBuckets[toBerlinDayKey(d)] = { outbound: 0, inbound: 0, missed: 0 };
  }
  for (const c of (calls7d.data ?? []) as Array<{ direction: string; status: string; started_at: string }>) {
    const key = toBerlinDayKey(c.started_at);
    if (!dayBuckets[key]) continue;
    if (c.status === "missed") dayBuckets[key].missed++;
    else if (c.direction === "inbound") dayBuckets[key].inbound++;
    else dayBuckets[key].outbound++;
  }
  const callsByDay = Object.entries(dayBuckets).map(([date, v]) => ({ date, ...v }));
  const callsTotal7d = callsByDay.reduce((s, d) => s + d.outbound + d.inbound + d.missed, 0);

  // Enrichments 7d (Berlin-Zeit)
  const enrichBuckets: Record<string, { completed: number; failed: number }> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600_000);
    enrichBuckets[toBerlinDayKey(d)] = { completed: 0, failed: 0 };
  }
  for (const e of (enrichments7d.data ?? []) as Array<{ status: string; created_at: string }>) {
    const key = toBerlinDayKey(e.created_at);
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

  // Anrufe 90 Tage — tägliche Aggregation in Berlin-Zeit. Ergibt 90 Einträge
  // mit direction-Breakdown; der Client filtert/aggregiert später auf
  // 7/30/90 Tage bzw. wöchentliche Bündel.
  const callsByDay90Buckets: Record<string, { outbound: number; inbound: number; missed: number }> = {};
  for (let i = 89; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600_000);
    callsByDay90Buckets[toBerlinDayKey(d)] = { outbound: 0, inbound: 0, missed: 0 };
  }
  for (const c of (calls90d.data ?? []) as Array<{ direction: string; status: string; started_at: string }>) {
    const key = toBerlinDayKey(c.started_at);
    const bucket = callsByDay90Buckets[key];
    if (!bucket) continue;
    if (c.status === "missed") bucket.missed++;
    else if (c.direction === "inbound") bucket.inbound++;
    else bucket.outbound++;
  }
  const callsByDay90 = Object.entries(callsByDay90Buckets).map(([date, v]) => ({ date, ...v }));

  // Team-Anrufe pro Nutzer: aus den 90-Tage-Calls je Nutzer in den Fenstern
  // 7/30/90 Tage zaehlen (rollierend). Client schaltet zwischen den Fenstern um.
  const cutoff7 = Date.now() - 7 * 24 * 3600_000;
  const cutoff30 = Date.now() - 30 * 24 * 3600_000;
  const teamCallAgg = new Map<string, { d7: number; d30: number; d90: number }>();
  for (const c of (calls90d.data ?? []) as Array<{ created_by: string | null; started_at: string }>) {
    if (!c.created_by) continue;
    const t = new Date(c.started_at).getTime();
    const cur = teamCallAgg.get(c.created_by) ?? { d7: 0, d30: 0, d90: 0 };
    cur.d90++;
    if (t >= cutoff30) cur.d30++;
    if (t >= cutoff7) cur.d7++;
    teamCallAgg.set(c.created_by, cur);
  }
  const teamCallUserIds = Array.from(teamCallAgg.keys());
  const teamCallNames = new Map<string, string>();
  if (teamCallUserIds.length > 0) {
    const { data: tcProfiles } = await db
      .from("profiles")
      .select("id, name, email")
      .in("id", teamCallUserIds);
    for (const p of (tcProfiles ?? []) as Array<{ id: string; name: string | null; email: string | null }>) {
      teamCallNames.set(p.id, p.name ?? p.email ?? "Unbekannt");
    }
  }
  const teamCallStats = teamCallUserIds
    .map((id) => ({ userId: id, name: teamCallNames.get(id) ?? "Unbekannt", ...teamCallAgg.get(id)! }))
    .sort((a, b) => b.d90 - a.d90);

  // Deal-Abschlüsse 12 Monate — monatliche Aggregation.
  const dealsByMonth12Buckets: Record<string, { won: number; lost: number; wonAmountCents: number; lostAmountCents: number }> = {};
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    d.setDate(1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    dealsByMonth12Buckets[key] = { won: 0, lost: 0, wonAmountCents: 0, lostAmountCents: 0 };
  }
  // stageKindById schnell nachschlagen für "won"/"lost".
  const stageKindById = new Map<string, string>();
  for (const s of stagesRows) stageKindById.set(s.id, s.kind);
  for (const d of (dealsClosed12m.data ?? []) as Array<{ stage_id: string; amount_cents: number; actual_close_date: string | null }>) {
    if (!d.actual_close_date) continue;
    const key = d.actual_close_date.slice(0, 7); // YYYY-MM
    const bucket = dealsByMonth12Buckets[key];
    if (!bucket) continue;
    const kind = stageKindById.get(d.stage_id);
    if (kind === "won") {
      bucket.won++;
      bucket.wonAmountCents += d.amount_cents ?? 0;
    } else if (kind === "lost") {
      bucket.lost++;
      bucket.lostAmountCents += d.amount_cents ?? 0;
    }
  }
  const dealsByMonth12 = Object.entries(dealsByMonth12Buckets).map(([month, v]) => ({ month, ...v }));

  // E-Mail-Performance 7d: sent/failed pro Tag (Berlin-Zeit).
  const emailBuckets: Record<string, { sent: number; failed: number }> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600_000);
    emailBuckets[toBerlinDayKey(d)] = { sent: 0, failed: 0 };
  }
  let emailsSent7d = 0;
  let emailsFailed7d = 0;
  for (const e of (emails7d.data ?? []) as Array<{ status: string; sent_at: string }>) {
    const key = toBerlinDayKey(e.sent_at);
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
    callsByDay90,
    teamCallStats,
    dealsByMonth12,
    openTodoItems,
    userId,
    serviceMode,
  };
}

export type DashboardData = Awaited<ReturnType<typeof loadDashboardData>>;
