// Zentrale Definition aller Dashboard-Widgets. Wird vom Editor + der Page genutzt.

export interface WidgetMeta {
  key: string;
  label: string;
  description: string;
  /** In der Default-Config wenn der User noch nichts gespeichert hat */
  defaultVisible: boolean;
  /** Ordnung im Default-Layout */
  defaultOrder: number;
  /** Nur in diesem Service-Modus sichtbar (optional) */
  serviceMode?: "recruiting" | "webdev";
}

export const WIDGET_REGISTRY: WidgetMeta[] = [
  { key: "pipeline", label: "Pipeline-Balken", description: "Lead-Verteilung über alle Status", defaultVisible: true, defaultOrder: 10 },
  { key: "stats", label: "Kennzahlen", description: "Vier Metriken passend zu deinem Modus", defaultVisible: true, defaultOrder: 20 },
  { key: "crm-queue", label: "CRM — Heute zu kontaktieren", description: "Leads mit Status Todo", defaultVisible: true, defaultOrder: 25 },
  { key: "todays-calls", label: "Heutige Anrufe", description: "Calls aller Nutzer seit 00:00", defaultVisible: false, defaultOrder: 30 },
  { key: "quick-actions", label: "Schnell-Aktionen", description: "Leads · Import · Anreichern · CRM", defaultVisible: true, defaultOrder: 40 },
  { key: "recent-leads", label: "Zuletzt bearbeitete Leads", description: "Die acht aktuellsten Leads", defaultVisible: true, defaultOrder: 50 },
  { key: "recent-activity", label: "Letzte Aktivitäten", description: "Audit-Log der letzten Schritte", defaultVisible: true, defaultOrder: 60 },
];

/** Key-Liste in Default-Reihenfolge, respektiert Service-Mode-Filter. */
export function defaultWidgetOrder(mode: "recruiting" | "webdev"): string[] {
  return WIDGET_REGISTRY
    .filter((w) => w.defaultVisible && (!w.serviceMode || w.serviceMode === mode))
    .sort((a, b) => a.defaultOrder - b.defaultOrder)
    .map((w) => w.key);
}

/** Gleicht eine User-Config gegen die Registry ab:
 *  - unbekannte Keys werden entfernt (falls Widget später wegfällt)
 *  - fehlende, aber default-sichtbare Keys werden am Ende angehängt (neue Widgets erscheinen automatisch) */
export function resolveUserWidgets(
  userWidgets: string[] | null,
  mode: "recruiting" | "webdev",
): string[] {
  if (!userWidgets) return defaultWidgetOrder(mode);
  const valid = userWidgets.filter((k) => WIDGET_REGISTRY.some((w) => w.key === k));
  const missingDefaults = WIDGET_REGISTRY
    .filter((w) => w.defaultVisible && !valid.includes(w.key) && (!w.serviceMode || w.serviceMode === mode))
    .sort((a, b) => a.defaultOrder - b.defaultOrder)
    .map((w) => w.key);
  return [...valid, ...missingDefaults];
}
