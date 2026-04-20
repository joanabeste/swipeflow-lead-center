import { createClient } from "@/lib/supabase/server";
import type { ServiceMode } from "@/lib/types";
import { Greeting } from "./greeting";
import { loadDashboardData } from "./widgets/data";
import { resolveUserWidgets } from "./widgets/registry";
import { DashboardEditor } from "./widgets/dashboard-editor";
import { SortableDashboard } from "./widgets/sortable-dashboard";
import {
  PipelineWidget, StatsWidget, QuickActionsWidget,
  RecentLeadsWidget, RecentActivityWidget, CrmQueueWidget, TodaysCallsWidget,
  MyDayWidget, CallStats7dWidget, EnrichmentTrend7dWidget, CrmStatusDistributionWidget,
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
  const userWidgets = (profile?.dashboard_widgets as string[] | null) ?? null;

  const data = await loadDashboardData(user.id, serviceMode);
  const widgets = resolveUserWidgets(userWidgets, serviceMode);

  const displayName = (userName?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "").trim();

  // Zweispaltige Widgets (recent-leads / recent-activity / crm-queue / todays-calls)
  // vs. volle Breite (pipeline / stats / quick-actions). Gruppen für Layout-Paare.
  const fullWidthKeys = [
    "pipeline", "stats", "quick-actions",
    "call-stats-7d", "enrichment-trend-7d", "crm-status-distribution",
  ];

  // Widgets auf dem Server rendern (Server Components mit DB-Zugriff) und
  // als ReactNode-Map an die Client-Komponente übergeben, damit der Drag-
  // and-Drop-Edit-Mode die gleichen Renderings umsortieren kann.
  const widgetNodes: Record<string, React.ReactNode> = {};
  for (const key of widgets) widgetNodes[key] = renderWidget(key, data);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Greeting displayName={displayName} />
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {motivationText(data, serviceMode)}
          </p>
        </div>
        <DashboardEditor initialOrder={widgets} serviceMode={serviceMode} />
      </div>

      <div className="mt-6">
        <SortableDashboard
          initialOrder={widgets}
          widgetNodes={widgetNodes}
          fullWidthKeys={fullWidthKeys}
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
