import type { DealStage, DealWithRelations } from "@/lib/deals/types";

export interface DealsKpis {
  openVolume: number;
  openCount: number;
  weightedForecastCents: number;
  wonLast30d: number;
  wonCount30d: number;
  wonTotal: number;
  winRate: number;
  wonCount: number;
  lostCount: number;
  lostTotal: number;
  avgDealSize: number;
  motivationalMessage: string;
}

export function computeKpis(deals: DealWithRelations[], stages: DealStage[]): DealsKpis {
  const now = Date.now();
  const thirtyDays = 30 * 24 * 3600 * 1000;
  const stageById = new Map(stages.map((s) => [s.id, s]));

  let openVolume = 0;
  let openCount = 0;
  let weightedForecastCents = 0;
  let wonLast30d = 0;
  let wonCount30d = 0;
  let wonTotal = 0;
  let lostTotal = 0;
  let wonCount = 0;
  let lostCount = 0;
  let dealCount = 0;
  let totalVolumeAll = 0;

  for (const d of deals) {
    const stage = stageById.get(d.stageId);
    const kind = stage?.kind ?? "open";
    dealCount++;
    totalVolumeAll += d.amountCents;
    if (kind === "open") {
      openVolume += d.amountCents;
      openCount++;
      const p = d.probability ?? 0;
      weightedForecastCents += Math.round((d.amountCents * p) / 100);
    } else if (kind === "won") {
      wonCount++;
      wonTotal += d.amountCents;
      const closedAt = d.actualCloseDate
        ? new Date(d.actualCloseDate).getTime()
        : new Date(d.updatedAt).getTime();
      if (now - closedAt <= thirtyDays) {
        wonLast30d += d.amountCents;
        wonCount30d++;
      }
    } else if (kind === "lost") {
      lostCount++;
      lostTotal += d.amountCents;
    }
  }

  const closedCount = wonCount + lostCount;
  const winRate = closedCount > 0 ? wonCount / closedCount : 0;
  const avgDealSize = dealCount > 0 ? Math.round(totalVolumeAll / dealCount) : 0;

  let motivationalMessage = "";
  if (openCount === 0 && wonCount === 0) {
    motivationalMessage = "Bereit für deinen ersten Deal — leg los.";
  } else if (wonCount30d > 0 && wonCount30d >= 3) {
    motivationalMessage = `🔥 ${wonCount30d} Abschlüsse im letzten Monat — weiter so.`;
  } else if (winRate >= 0.5 && closedCount >= 3) {
    motivationalMessage = `Starke ${Math.round(winRate * 100)}% Gewinn-Quote — dran bleiben.`;
  } else if (openCount >= 5) {
    motivationalMessage = `${openCount} offene Deals — ein Closing-Call pro Tag macht den Unterschied.`;
  } else if (openCount > 0) {
    motivationalMessage = "Jeder Follow-Up zählt. Nächster Schritt?";
  }

  return {
    openVolume, openCount, weightedForecastCents,
    wonLast30d, wonCount30d, wonTotal,
    winRate, wonCount, lostCount, lostTotal,
    avgDealSize, motivationalMessage,
  };
}
