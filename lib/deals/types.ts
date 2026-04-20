export type DealStageKind = "open" | "won" | "lost";

export interface DealStage {
  id: string;
  label: string;
  description: string | null;
  color: string;
  displayOrder: number;
  kind: DealStageKind;
  isActive: boolean;
}

export interface Deal {
  id: string;
  leadId: string;
  title: string;
  description: string | null;
  amountCents: number;
  currency: string;
  stageId: string;
  assignedTo: string | null;
  expectedCloseDate: string | null; // ISO date
  actualCloseDate: string | null;
  probability: number | null;       // 0–100
  nextStep: string | null;
  lastFollowupAt: string | null;    // ISO date
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Gewichteter Forecast eines Deals (amount * probability/100), auch 0 wenn keine Probability. */
export function weightedForecastCents(deal: Pick<Deal, "amountCents" | "probability">): number {
  const p = deal.probability ?? 0;
  return Math.round((deal.amountCents * p) / 100);
}

export interface DealWithRelations extends Deal {
  company_name: string;
  company_domain: string | null;
  stage_label: string;
  stage_color: string;
  stage_kind: DealStageKind;
  assignee_name: string | null;
  assignee_avatar_url: string | null;
}

export interface DealChange {
  id: string;
  dealId: string;
  changedBy: string | null;
  changedByName: string | null;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

/** Formatiert Cent → "€3.000,00" */
export function formatAmount(cents: number, currency = "EUR"): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** Parst "3000", "3.000", "3.000,50", "€3,000" → Cent. Gibt null bei invalid. */
export function parseAmountToCents(input: string): number | null {
  const cleaned = input
    .replace(/[^\d.,]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "") // Tausender-Punkt
    .replace(",", ".");
  if (!cleaned) return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
}

/** Ist der Deal länger als 30 Tage unverändert? */
export function isStale(deal: Pick<Deal, "updatedAt" | "stageId">, stages: DealStage[]): boolean {
  const stage = stages.find((s) => s.id === deal.stageId);
  if (!stage || stage.kind !== "open") return false;
  const days = (Date.now() - new Date(deal.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
  return days > 30;
}
