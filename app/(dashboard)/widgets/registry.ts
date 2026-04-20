// Zentrale Definition aller Dashboard-Widgets. Wird vom Editor + der Page genutzt.

export type WidgetWidth = "third" | "half" | "two-thirds" | "full";

export interface WidgetLayoutItem {
  /** Widget-Key aus der Registry */
  k: string;
  /** Breite auf dem 12-Spalten-Grid */
  w: WidgetWidth;
}

export interface WidgetMeta {
  key: string;
  label: string;
  description: string;
  /** In der Default-Config wenn der User noch nichts gespeichert hat */
  defaultVisible: boolean;
  /** Ordnung im Default-Layout */
  defaultOrder: number;
  /** Default-Breite für neu hinzugefügte Widgets */
  defaultWidth: WidgetWidth;
  /** Nur in diesem Service-Modus sichtbar (optional) */
  serviceMode?: "recruiting" | "webdev";
}

export const WIDGET_REGISTRY: WidgetMeta[] = [
  { key: "my-day", label: "Mein Tag", description: "Deine Calls & Notizen heute, offene Todos", defaultVisible: true, defaultOrder: 5, defaultWidth: "half" },
  { key: "pipeline", label: "Pipeline-Balken", description: "Lead-Verteilung über alle Status", defaultVisible: true, defaultOrder: 10, defaultWidth: "full" },
  { key: "stats", label: "Kennzahlen", description: "Vier Metriken passend zu deinem Modus", defaultVisible: true, defaultOrder: 20, defaultWidth: "full" },
  { key: "crm-queue", label: "CRM — Heute zu kontaktieren", description: "Leads mit Status Todo", defaultVisible: true, defaultOrder: 25, defaultWidth: "half" },
  { key: "crm-status-distribution", label: "CRM-Status-Verteilung", description: "Qualifizierte Leads nach Vertriebsphase", defaultVisible: false, defaultOrder: 27, defaultWidth: "full" },
  { key: "todays-calls", label: "Heutige Anrufe", description: "Calls aller Nutzer seit 00:00", defaultVisible: false, defaultOrder: 30, defaultWidth: "half" },
  { key: "call-stats-7d", label: "Anrufe (7 Tage)", description: "Tägliche Anruf-Statistik aller Nutzer", defaultVisible: false, defaultOrder: 32, defaultWidth: "full" },
  { key: "enrichment-trend-7d", label: "Anreicherungen (7 Tage)", description: "Erfolg/Fehler der letzten 7 Tage", defaultVisible: false, defaultOrder: 34, defaultWidth: "full" },
  { key: "quick-actions", label: "Schnell-Aktionen", description: "Leads · Import · Anreichern · CRM", defaultVisible: true, defaultOrder: 40, defaultWidth: "full" },
  { key: "recent-leads", label: "Zuletzt bearbeitete Leads", description: "Die acht aktuellsten Leads", defaultVisible: true, defaultOrder: 50, defaultWidth: "half" },
  { key: "recent-activity", label: "Letzte Aktivitäten", description: "Audit-Log der letzten Schritte", defaultVisible: true, defaultOrder: 60, defaultWidth: "half" },
];

const WIDGET_KEYS = new Set(WIDGET_REGISTRY.map((w) => w.key));

export function getWidgetMeta(key: string): WidgetMeta | null {
  return WIDGET_REGISTRY.find((w) => w.key === key) ?? null;
}

export const WIDGET_WIDTHS: WidgetWidth[] = ["third", "half", "two-thirds", "full"];

/** Spanne auf einem 12-Spalten-Grid. */
export function widgetColSpan(w: WidgetWidth): number {
  switch (w) {
    case "third": return 4;
    case "half": return 6;
    case "two-thirds": return 8;
    case "full": return 12;
  }
}

/** Default-Layout (alle default-sichtbaren Widgets mit ihrer Default-Breite). */
export function defaultLayout(mode: "recruiting" | "webdev"): WidgetLayoutItem[] {
  return WIDGET_REGISTRY
    .filter((w) => w.defaultVisible && (!w.serviceMode || w.serviceMode === mode))
    .sort((a, b) => a.defaultOrder - b.defaultOrder)
    .map((w) => ({ k: w.key, w: w.defaultWidth }));
}

/**
 * Normalisiert die gespeicherte User-Config auf das neue Layout-Format.
 * Robust gegen:
 *  - null / undefined → Default-Layout
 *  - altes text[]-Format (Backwards-Compat, falls die Migration noch nicht lief)
 *  - unbekannte Keys → werden entfernt
 *  - neue Default-Widgets, die der User noch nicht hat → werden angehängt
 */
export function resolveUserLayout(
  userLayout: unknown,
  mode: "recruiting" | "webdev",
): WidgetLayoutItem[] {
  if (userLayout == null) return defaultLayout(mode);

  // Neues Format: jsonb-Array mit { k, w }
  const items: WidgetLayoutItem[] = [];
  if (Array.isArray(userLayout)) {
    for (const entry of userLayout) {
      if (typeof entry === "string") {
        // Altes Format: reiner Key-String
        if (WIDGET_KEYS.has(entry)) {
          const meta = getWidgetMeta(entry)!;
          items.push({ k: entry, w: meta.defaultWidth });
        }
      } else if (entry && typeof entry === "object" && "k" in entry) {
        const k = (entry as { k?: unknown }).k;
        const w = (entry as { w?: unknown }).w;
        if (typeof k === "string" && WIDGET_KEYS.has(k)) {
          const width = (["third", "half", "two-thirds", "full"] as const).includes(w as WidgetWidth)
            ? (w as WidgetWidth)
            : getWidgetMeta(k)!.defaultWidth;
          items.push({ k, w: width });
        }
      }
    }
  }

  // Default-Widgets, die fehlen, hinten anhängen — so tauchen neu eingeführte
  // Widgets automatisch beim nächsten Render auf.
  const present = new Set(items.map((i) => i.k));
  const missingDefaults = WIDGET_REGISTRY
    .filter((w) => w.defaultVisible && !present.has(w.key) && (!w.serviceMode || w.serviceMode === mode))
    .sort((a, b) => a.defaultOrder - b.defaultOrder)
    .map((w) => ({ k: w.key, w: w.defaultWidth }));

  return [...items, ...missingDefaults];
}
