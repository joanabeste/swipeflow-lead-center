import { createClient } from "@/lib/supabase/server";
import { currentMonth, normalizeMonth } from "@/lib/deals/month";
import { loadSalesKpiReport } from "@/lib/deals/kpi-report";
import { renderSalesKpiReportHtml } from "@/lib/deals/kpi-report-template";
import { renderHtmlToPdf } from "@/lib/contracts/pdf";

// Chromium (via @sparticuz/chromium-min) braucht die Node-Runtime, nicht Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const month = normalizeMonth(url.searchParams.get("month")) ?? currentMonth();

  try {
    const report = await loadSalesKpiReport(month);
    const html = renderSalesKpiReportHtml(report, new Date().toISOString());
    const pdf = await renderHtmlToPdf(html);

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="sales-report-${month}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unbekannter Fehler";
    return new Response(`PDF konnte nicht erstellt werden: ${message}`, { status: 500 });
  }
}
