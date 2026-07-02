import { requireSection } from "@/lib/auth";
import { currentMonth, normalizeMonth } from "@/lib/deals/month";
import { loadSalesKpiReport } from "@/lib/deals/kpi-report";
import { StatsDashboard } from "./stats-dashboard";

export default async function StatistikenPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireSection("can_vertrieb");
  const sp = await searchParams;
  const month = normalizeMonth(sp.month) ?? currentMonth();
  const report = await loadSalesKpiReport(month);
  return <StatsDashboard report={report} month={month} />;
}
