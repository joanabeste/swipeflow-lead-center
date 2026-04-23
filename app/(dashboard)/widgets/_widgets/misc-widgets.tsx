import Link from "next/link";
import { Mail, Quote } from "lucide-react";
import type { DashboardData } from "../data";
import { Card, LegendDot, weekdayShort } from "./shared";
import { getQuoteOfDay } from "@/lib/quotes/sales-quotes";

// ─── Enrichments (7 Tage) ───────────────────────────────────────

export function EnrichmentTrend7dWidget({ data }: { data: DashboardData }) {
  const maxDaily = Math.max(1, ...data.enrichmentsByDay.map((d) => d.completed + d.failed));
  const totalOk = data.enrichmentsByDay.reduce((s, d) => s + d.completed, 0);
  const totalFail = data.enrichmentsByDay.reduce((s, d) => s + d.failed, 0);
  const rate = totalOk + totalFail > 0 ? Math.round((totalOk / (totalOk + totalFail)) * 100) : 0;
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Anreicherungen (7 Tage)</p>
          <p className="mt-0.5 text-lg font-bold">{rate}% Erfolgsquote</p>
        </div>
        <div className="flex gap-3 text-xs">
          <LegendDot color="bg-emerald-500" label={`Erfolg ${totalOk}`} />
          <LegendDot color="bg-red-400" label={`Fehler ${totalFail}`} />
        </div>
      </div>
      <div className="mt-5 flex h-28 items-end gap-1.5">
        {data.enrichmentsByDay.map((d) => {
          const total = d.completed + d.failed;
          const h = (total / maxDaily) * 100;
          return (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-col justify-end" style={{ height: "6rem" }}>
                <div className="flex w-full flex-col overflow-hidden rounded-t-md" style={{ height: `${h}%` }}>
                  {d.completed > 0 && <div className="bg-emerald-500" style={{ flexGrow: d.completed }} title={`Erfolg: ${d.completed}`} />}
                  {d.failed > 0 && <div className="bg-red-400" style={{ flexGrow: d.failed }} title={`Fehler: ${d.failed}`} />}
                </div>
              </div>
              <p className="text-[10px] text-gray-400">{weekdayShort(d.date)}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── E-Mail-Performance (7 Tage) ─────────────────────────────────

export function EmailStats7dWidget({ data }: { data: DashboardData }) {
  const maxDaily = Math.max(1, ...data.emailsByDay.map((d) => d.sent + d.failed));
  const total = data.emailsSent7d + data.emailsFailed7d;
  const rate = total > 0 ? Math.round((data.emailsSent7d / total) * 100) : 0;
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400">
            <Mail className="h-3.5 w-3.5 text-blue-500" />
            E-Mails (7 Tage)
          </p>
          <p className="mt-0.5 text-lg font-bold">
            {total} gesamt
            {total > 0 && <span className="ml-2 text-sm font-normal text-gray-500">· {rate}% erfolgreich</span>}
          </p>
        </div>
        <div className="flex gap-3 text-xs">
          <LegendDot color="bg-blue-500" label={`Gesendet ${data.emailsSent7d}`} />
          <LegendDot color="bg-red-400" label={`Fehler ${data.emailsFailed7d}`} />
        </div>
      </div>
      <div className="mt-5 flex h-24 items-end gap-1.5">
        {data.emailsByDay.map((d) => {
          const dayTotal = d.sent + d.failed;
          const h = (dayTotal / maxDaily) * 100;
          return (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-col justify-end" style={{ height: "5rem" }}>
                <div className="flex w-full flex-col overflow-hidden rounded-t-md" style={{ height: `${h}%` }}>
                  {d.sent > 0 && <div className="bg-blue-500" style={{ flexGrow: d.sent }} title={`Gesendet: ${d.sent}`} />}
                  {d.failed > 0 && <div className="bg-red-400" style={{ flexGrow: d.failed }} title={`Fehler: ${d.failed}`} />}
                </div>
              </div>
              <p className="text-[10px] text-gray-400">{weekdayShort(d.date)}</p>
            </div>
          );
        })}
      </div>
      {total === 0 && (
        <p className="mt-4 text-center text-xs text-gray-400">
          Noch keine E-Mails versendet — SMTP unter <Link href="/einstellungen/email" className="text-primary hover:underline">Einstellungen → E-Mail</Link> einrichten.
        </p>
      )}
    </Card>
  );
}

// ─── Spruch des Tages ────────────────────────────────────────────

export function MotivationalQuoteWidget() {
  const quote = getQuoteOfDay();
  // Farb-Akzent je Tonalität — subtil, aber der Spruch wechselt visuell.
  const toneClass =
    quote.tone === "humor"
      ? "from-amber-100 to-orange-50 text-amber-900 dark:from-amber-900/20 dark:to-orange-900/10 dark:text-amber-100"
      : quote.tone === "classic"
        ? "from-indigo-100 to-purple-50 text-indigo-900 dark:from-indigo-900/20 dark:to-purple-900/10 dark:text-indigo-100"
        : quote.tone === "wisdom"
          ? "from-emerald-100 to-teal-50 text-emerald-900 dark:from-emerald-900/20 dark:to-teal-900/10 dark:text-emerald-100"
          : "from-primary/15 to-primary/5 text-gray-900 dark:text-gray-100";
  return (
    <div className={`relative flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br ${toneClass} p-5 dark:border-[#2c2c2e]/50`}>
      <Quote className="absolute right-4 top-4 h-8 w-8 opacity-20" />
      {/* flex-1 + justify-center: wenn daneben eine höhere Kachel steht
          (z.B. Deal-Summary), zentriert sich der Spruch vertikal mittig
          statt oben zu kleben. */}
      <div className="relative flex flex-1 flex-col justify-center">
        <p className="text-xs font-semibold uppercase tracking-wider opacity-70">
          Spruch des Tages
        </p>
        <p className="mt-2 text-lg font-medium leading-snug sm:text-xl">
          &bdquo;{quote.text}&ldquo;
        </p>
        {quote.author && (
          <p className="mt-2 text-xs opacity-75">— {quote.author}</p>
        )}
      </div>
    </div>
  );
}
