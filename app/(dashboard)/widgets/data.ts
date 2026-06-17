import { createServiceClient } from "@/lib/supabase/server";
import type { ServiceMode } from "@/lib/types";
import { toBerlinDayKey } from "@/lib/date/day-key";
import { startOfDayInAppTz } from "@/lib/zeit/timezone";
import { CALL_STATUS_ORDER } from "@/lib/calls/status-display";
import { loadTodaysCalls, TODAY_CALLS_PAGE_SIZE } from "@/lib/calls/today";
import { loadCallStats } from "@/lib/calls/call-stats";
import { MODE_TO_VERTICAL } from "@/lib/service-mode-constants";

/** Lädt einmal alle für Dashboard-Widgets nötigen Daten zentral. */
export async function loadDashboardData(userId: string, serviceMode: ServiceMode) {
  const db = createServiceClient();
  // Vertikale-Filter fuer alle „post-qualification" Queries. Top-of-Funnel
  // (totals, imported, enriched, enrichment_pending) bleibt unverteilt, weil
  // neue Leads beim Import noch keine Vertikale haben (vertical IS NULL).
  const vertical = MODE_TO_VERTICAL[serviceMode];
  // "Heute" = ab 00:00 Berlin-Zeit (Server laeuft in UTC). Betrifft konsistent
  // alle Tages-Queries (todaysCalls, teamCallsToday, myDay).
  const today = startOfDayInAppTz();
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
  ];

  const [
    totals, imported, enriched, enrichmentPending, qualified, exported, cancelled, filtered,
    enrichmentCompleted, enrichmentFailed, recentLeads, recentLogs, crmQueue,
  ] = await Promise.all(baseQueries);

  // Erste Seite der heutigen Anrufe (Firma + Anrufer aufgelöst). Weitere Seiten
  // lädt das Widget bei Bedarf über /api/calls/today nach.
  const todaysCallsList = await loadTodaysCalls(db, { offset: 0, limit: TODAY_CALLS_PAGE_SIZE });

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
    enrichments7d, crmStatusDistRaw, customStatuses,
    // Neue Widgets:
    followupCandidates, openDealsRaw, dealStages, emails7d,
    dealsClosed12m,
    // Anruf-Statistik (heute / 7 / 90 Tage, pro Person/Status) aus EINER
    // DB-seitigen Aggregation — umgeht das PostgREST-1000-Zeilen-Limit, das die
    // Anrufzahlen vorher still gedeckelt hat. Fällt auf paginiertes Laden
    // zurück, falls die RPC (Migration 125) noch nicht eingespielt ist.
    callStats,
  ] = await Promise.all([
    db.from("lead_calls").select("*", { count: "exact", head: true })
      .eq("created_by", userId).gte("started_at", todayIso),
    db.from("lead_notes").select("*", { count: "exact", head: true })
      .eq("created_by", userId).gte("created_at", todayIso),
    db.from("leads").select("*", { count: "exact", head: true })
      .eq("status", "qualified").eq("crm_status_id", "todo").eq("vertical", vertical).is("deleted_at", null),
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
    // Offene Deals gruppiert nach Stage (open kind), mit Amount.
    db.from("deals").select("stage_id, amount_cents").is("deleted_at", null),
    db.from("deal_stages").select("id, label, color, kind, display_order")
      .eq("is_active", true).order("display_order", { ascending: true }),
    // E-Mails 7 Tage: sent/failed pro Tag.
    db.from("email_messages").select("status, sent_at")
      .gte("sent_at", sevenDaysIso),
    // Abgeschlossene Deals der letzten 12 Monate (für Trend-Widget).
    db.from("deals").select("stage_id, amount_cents, actual_close_date")
      .gte("actual_close_date", twelveMonthsAgoIso)
      .not("actual_close_date", "is", null)
      .is("deleted_at", null),
    // Anrufe (heute/7/90 Tage) DB-seitig aggregiert — siehe Kommentar oben.
    loadCallStats(db, ninetyDaysAgoIso),
  ]);

  // Offene Aufgaben (Wiedervorlagen) — für Dashboard-Widget.
  // Zeigt überfällige + heutige + nächste 7 Tage. Lead-Daten parallel via Lookup.
  const todayDateOnly = toBerlinDayKey(today);
  const sevenDaysAheadKey = new Date(Date.now() + 7 * 24 * 3600_000).toISOString().slice(0, 10);
  type OpenTodo = { id: string; lead_id: string; title: string; due_date: string; due_time: string | null };
  const firstTodo = await db
    .from("lead_todos")
    .select("id, lead_id, title, due_date, due_time")
    .is("done_at", null)
    .lte("due_date", sevenDaysAheadKey)
    .order("due_date", { ascending: true })
    .limit(50);
  let openTodoRows = firstTodo.data as OpenTodo[] | null;
  if (firstTodo.error && (firstTodo.error.code === "42703" || /due_time/i.test(firstTodo.error.message))) {
    // Migration 124 noch nicht eingespielt — ohne Uhrzeit weiterladen.
    const fallback = await db
      .from("lead_todos")
      .select("id, lead_id, title, due_date")
      .is("done_at", null)
      .lte("due_date", sevenDaysAheadKey)
      .order("due_date", { ascending: true })
      .limit(50);
    openTodoRows = fallback.data as OpenTodo[] | null;
  }
  const openTodos = openTodoRows ?? [];
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
        dueTime: t.due_time ? t.due_time.slice(0, 5) : null,
        tone,
        company_name: lead.company_name,
        city: lead.city,
      };
    });

  // Calls 7d — aus der aggregierten Anruf-Statistik (callStats), pro Berlin-Tag.
  const dayBuckets: Record<string, { outbound: number; inbound: number; missed: number }> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600_000);
    dayBuckets[toBerlinDayKey(d)] = { outbound: 0, inbound: 0, missed: 0 };
  }
  for (const r of callStats) {
    const b = dayBuckets[r.day];
    if (!b) continue;
    if (r.status === "missed") b.missed += r.cnt;
    else if (r.direction === "inbound") b.inbound += r.cnt;
    else b.outbound += r.cnt;
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

  // Team-Leaderboard heute: Anrufe pro User — aus callStats (Berlin-Tag = heute).
  const todayKey = toBerlinDayKey(today);
  const todayStats = callStats.filter((r) => r.day === todayKey);
  const leaderboardAgg = new Map<string, { total: number; answered: number; missed: number }>();
  for (const r of todayStats) {
    if (!r.created_by) continue;
    const cur = leaderboardAgg.get(r.created_by) ?? { total: 0, answered: 0, missed: 0 };
    cur.total += r.cnt;
    if (r.status === "answered") cur.answered += r.cnt;
    else if (r.status === "missed") cur.missed += r.cnt;
    leaderboardAgg.set(r.created_by, cur);
  }

  // Tages-Zusammenfassung für die „Heutige Anrufe"-Karte (KPI-Kopf + Aufschlüsselung).
  // Basis = ALLE heutigen Calls (todayStats), nicht die auf 20 limitierte Liste.
  const statusCountMap = new Map<string, number>();
  let todayTotal = 0, todayAnswered = 0, todayMissed = 0, todayFailed = 0;
  for (const r of todayStats) {
    const st = r.status ?? "";
    todayTotal += r.cnt;
    statusCountMap.set(st, (statusCountMap.get(st) ?? 0) + r.cnt);
    if (r.status === "answered") todayAnswered += r.cnt;
    else if (r.status === "missed") todayMissed += r.cnt;
    else if (r.status === "failed") todayFailed += r.cnt;
  }
  // byStatus in sinnvoller Reihenfolge; unbekannte Status hinten anhängen.
  const orderedStatuses = [
    ...CALL_STATUS_ORDER.filter((s) => statusCountMap.has(s)),
    ...Array.from(statusCountMap.keys()).filter((s) => !CALL_STATUS_ORDER.includes(s as typeof CALL_STATUS_ORDER[number])),
  ];
  const byStatus = orderedStatuses.map((status) => ({ status, count: statusCountMap.get(status) ?? 0 }));
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

  // „Heutige Anrufe"-Karte: Aufschlüsselung nach Person (alle Personen, nicht
  // nur Top 5 — die Karte zeigt das vollständige Bild des Tages).
  const byPerson = leaderboardUserIds
    .map((id) => {
      const agg = leaderboardAgg.get(id)!;
      return {
        userId: id,
        name: leaderboardNames.get(id) ?? "Unbekannt",
        total: agg.total,
        answered: agg.answered,
        missed: agg.missed,
        rate: agg.total > 0 ? Math.round((agg.answered / agg.total) * 100) : 0,
      };
    })
    .sort((a, b) => b.total - a.total);

  const todaysCallSummary = {
    total: todayTotal,
    answered: todayAnswered,
    missed: todayMissed,
    failed: todayFailed,
    reachRate: todayTotal > 0 ? Math.round((todayAnswered / todayTotal) * 100) : 0,
    byStatus,
    byPerson,
  };

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
  const callsByDay90Buckets: Record<string, { outbound: number; inbound: number; missed: number; byUser: Record<string, number> }> = {};
  const dayKeys90: string[] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600_000);
    const key = toBerlinDayKey(d);
    dayKeys90.push(key);
    callsByDay90Buckets[key] = { outbound: 0, inbound: 0, missed: 0, byUser: {} };
  }
  for (const r of callStats) {
    const bucket = callsByDay90Buckets[r.day];
    if (!bucket) continue;
    if (r.status === "missed") bucket.missed += r.cnt;
    else if (r.direction === "inbound") bucket.inbound += r.cnt;
    else bucket.outbound += r.cnt;
    if (r.created_by) bucket.byUser[r.created_by] = (bucket.byUser[r.created_by] ?? 0) + r.cnt;
  }
  const callsByDay90 = Object.entries(callsByDay90Buckets).map(([date, v]) => ({ date, ...v }));

  // Team-Anrufe pro Nutzer: je Nutzer in den Fenstern 7/30/90 Tage zaehlen.
  // Fenster = letzte N Kalendertage (konsistent mit den Chart-Slices, die genau
  // diese Tagesbuckets verwenden). Client schaltet zwischen den Fenstern um.
  const days7 = new Set(dayKeys90.slice(-7));
  const days30 = new Set(dayKeys90.slice(-30));
  const teamCallAgg = new Map<string, { d7: number; d30: number; d90: number }>();
  for (const r of callStats) {
    if (!r.created_by) continue;
    const cur = teamCallAgg.get(r.created_by) ?? { d7: 0, d30: 0, d90: 0 };
    cur.d90 += r.cnt;
    if (days30.has(r.day)) cur.d30 += r.cnt;
    if (days7.has(r.day)) cur.d7 += r.cnt;
    teamCallAgg.set(r.created_by, cur);
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
    todaysCalls: todaysCallsList,
    // Gesamtzahl heutiger Anrufe (alle, nicht nur die auf 20 limitierte Liste).
    todaysCallsTotal: todaysCallSummary.total,
    todaysCallSummary,
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
