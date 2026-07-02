import { createClient } from "@/lib/supabase/server";
import { toBerlinDayKey } from "@/lib/date/day-key";
import { loadSalesKpiReport } from "@/lib/deals/kpi-report";
import { renderSalesKpiReportHtml } from "@/lib/deals/kpi-report-template";
import { renderHtmlToPdf } from "@/lib/contracts/pdf";

// Chromium (via @sparticuz/chromium-min) braucht die Node-Runtime, nicht Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Aktueller Monat als `YYYY-MM` in Europe/Berlin. */
function currentMonth(): string {
  return toBerlinDayKey(new Date()).slice(0, 7);
}

/** Validiert `YYYY-MM` mit Monat 01–12; sonst null. */
function normalizeMonth(raw: string | null): string | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return raw;
}

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
