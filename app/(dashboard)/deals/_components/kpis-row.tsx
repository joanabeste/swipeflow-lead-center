import { Euro, Percent, Sparkles, TrendingUp, Trophy } from "lucide-react";
import { formatAmount } from "@/lib/deals/types";
import type { DealsKpis } from "../_lib/compute-kpis";
import { KpiCard } from "./kpi-card";

export function KpisRow({ kpis }: { kpis: DealsKpis }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      {/* Hero: Offenes Volumen — groß, primary-Farbig, motivierend */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-6 dark:border-primary/20">
        <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-primary/10 blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
            <Euro className="h-3.5 w-3.5" />
            Offenes Volumen
          </div>
          <p className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
            {formatAmount(kpis.openVolume)}
          </p>
          <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
            {kpis.openCount} {kpis.openCount === 1 ? "offener Deal" : "offene Deals"}
            {kpis.weightedForecastCents > 0 && (
              <>
                <span className="mx-1.5">·</span>
                <span>
                  Forecast{" "}
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {formatAmount(kpis.weightedForecastCents)}
                  </span>
                </span>
              </>
            )}
          </p>
          {kpis.motivationalMessage && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 text-xs font-medium text-primary dark:bg-white/5">
              <Sparkles className="h-3 w-3" />
              {kpis.motivationalMessage}
            </p>
          )}
        </div>
      </div>

      {/* Neben-KPIs */}
      <div className="grid grid-cols-3 gap-3 lg:col-span-2">
        <KpiCard
          icon={Trophy}
          label="Gewonnen (30 Tage)"
          value={formatAmount(kpis.wonLast30d)}
          subtitle={`${kpis.wonCount30d} Abschlüsse`}
          tone="success"
        />
        <KpiCard
          icon={Percent}
          label="Gewinn-Quote"
          value={`${Math.round(kpis.winRate * 100)}%`}
          subtitle={`${kpis.wonCount} / ${kpis.wonCount + kpis.lostCount} abgeschlossen`}
          tone="neutral"
        />
        <KpiCard
          icon={TrendingUp}
          label="Ø Deal-Größe"
          value={formatAmount(kpis.avgDealSize)}
          tone="neutral"
        />
      </div>
    </div>
  );
}
