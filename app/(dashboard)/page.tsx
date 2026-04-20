import { createClient } from "@/lib/supabase/server";
import type { ServiceMode } from "@/lib/types";
import { Greeting } from "./greeting";
import { loadDashboardData } from "./widgets/data";
import { resolveUserLayout } from "./widgets/registry";
import { SortableDashboard } from "./widgets/sortable-dashboard";
import {
  PipelineWidget, StatsWidget, QuickActionsWidget,
  RecentLeadsWidget, RecentActivityWidget, CrmQueueWidget, TodaysCallsWidget,
  MyDayWidget, CallStats7dWidget, EnrichmentTrend7dWidget, CrmStatusDistributionWidget,
  FollowUpReminderWidget, TeamLeaderboardWidget, DealSummaryWidget, EmailStats7dWidget,
} from "./widgets/widgets";

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("service_mode, name, dashboard_widgets")
    .eq("id", user.id)
    .single();
  const serviceMode: ServiceMode = (profile?.service_mode as ServiceMode) ?? "recruiting";
  const userName = (profile?.name as string | null) ?? null;

  const data = await loadDashboardData(user.id, serviceMode);
  const layout = resolveUserLayout(profile?.dashboard_widgets ?? null, serviceMode);

  const displayName = (userName?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "").trim();

  // Widgets auf dem Server rendern (Server Components mit DB-Zugriff) und
  // als ReactNode-Map an die Client-Komponente übergeben, damit der
  // Edit-Mode dieselben Renderings umsortieren kann.
  const widgetNodes: Record<string, React.ReactNode> = {};
  for (const item of layout) widgetNodes[item.k] = renderWidget(item.k, data);

  return (
    <div>
      <div>
        <Greeting displayName={displayName} />
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {motivationText(data, serviceMode)}
        </p>
      </div>

      <div className="mt-6">
        <SortableDashboard
          initialLayout={layout}
          widgetNodes={widgetNodes}
          serviceMode={serviceMode}
        />
      </div>
    </div>
  );
}

function renderWidget(key: string, data: Awaited<ReturnType<typeof loadDashboardData>>): React.ReactNode {
  switch (key) {
    case "my-day": return <MyDayWidget data={data} />;
    case "pipeline": return <PipelineWidget data={data} />;
    case "stats": return <StatsWidget data={data} />;
    case "quick-actions": return <QuickActionsWidget data={data} />;
    case "recent-leads": return <RecentLeadsWidget data={data} />;
    case "recent-activity": return <RecentActivityWidget data={data} />;
    case "crm-queue": return <CrmQueueWidget data={data} />;
    case "crm-status-distribution": return <CrmStatusDistributionWidget data={data} />;
    case "todays-calls": return <TodaysCallsWidget data={data} />;
    case "call-stats-7d": return <CallStats7dWidget data={data} />;
    case "enrichment-trend-7d": return <EnrichmentTrend7dWidget data={data} />;
    case "follow-up-reminder": return <FollowUpReminderWidget data={data} />;
    case "team-leaderboard": return <TeamLeaderboardWidget data={data} />;
    case "deal-summary": return <DealSummaryWidget data={data} />;
    case "email-stats-7d": return <EmailStats7dWidget data={data} />;
    default: return null;
  }
}

function motivationText(data: Awaited<ReturnType<typeof loadDashboardData>>, serviceMode: ServiceMode): string {
  const c = data.counts;
  const readyToExport = c.qualified;
  const waiting = c.imported;
  const enrichTotal = c.enrichmentCompleted + c.enrichmentFailed;
  const qualifyRate = c.total > 0 ? Math.round(((c.qualified + c.exported) / c.total) * 100) : 0;
  if (c.total === 0) return "Noch leer hier — ein Import bringt deinen Funnel in Schwung.";
  if (data.crmQueue.length > 0) return `${data.crmQueue.length} ${data.crmQueue.length === 1 ? "Lead wartet" : "Leads warten"} im CRM auf Kontakt. Let's go.`;
  if (readyToExport > 0) return `${readyToExport} ${readyToExport === 1 ? "Lead ist" : "Leads sind"} bereit fürs CRM. Zeit zu closen.`;
  if (waiting >= 10) return `${waiting} Leads warten auf Anreicherung — heute wird's produktiv.`;
  if (waiting > 0) return `${waiting} ${waiting === 1 ? "Lead wartet" : "Leads warten"} auf Anreicherung. Lass uns loslegen.`;
  if (qualifyRate >= 30) return `Starke Quote: ${qualifyRate}% qualifizierte Leads. Weiter so.`;
  if (serviceMode === "webdev" && enrichTotal > 0) return "Webdesign-Pipeline läuft — prüfe die Issues.";
  return "Heute ein guter Tag, um neue Leads reinzubringen.";
}
