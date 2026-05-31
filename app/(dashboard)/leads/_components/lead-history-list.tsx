import type { LeadChange } from "@/lib/types";
import { LEAD_STATUS_OPTIONS, TRAFFIC_LIGHT_OPTIONS } from "@/lib/types";
import { leadFieldLabels } from "./lead-master-data-form";

export interface ActivityItem {
  id: string;
  kind: "change" | "call" | "note" | "enrichment" | "crm_status" | "status";
  at: string;
  title: string;
  detail?: string;
  meta?: string;
}

function activityColor(kind: ActivityItem["kind"]): string {
  switch (kind) {
    case "call": return "#10b981";
    case "note": return "#f59e0b";
    case "enrichment": return "#6366f1";
    case "crm_status": return "#ec4899";
    case "status": return "#3b82f6";
    default: return "#9ca3af";
  }
}

function activityIcon(kind: ActivityItem["kind"]): string {
  switch (kind) {
    case "call": return "📞";
    case "note": return "📝";
    case "enrichment": return "✨";
    case "crm_status": return "🎯";
    case "status": return "🏷️";
    default: return "•";
  }
}

export function LeadActivityTimeline({ items }: { items: ActivityItem[] }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">
        Historie ({items.length})
      </h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-gray-400">Noch keine Aktivitäten.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.slice(0, 50).map((item) => (
            <li
              key={item.id}
              className="border-l-2 pl-3 text-sm"
              style={{ borderColor: activityColor(item.kind) }}
            >
              <p className="font-medium text-gray-700 dark:text-gray-300">
                <span className="mr-1">{activityIcon(item.kind)}</span>
                {item.title}
              </p>
              {item.detail && (
                <p className="text-gray-500 dark:text-gray-400">{item.detail}</p>
              )}
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {new Date(item.at).toLocaleString("de-DE")}
                {item.meta ? ` · ${item.meta}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Labels für Felder, die in der Historie auftauchen, aber nicht im
// Stammdaten-Formular stehen (Ampel, Status …). Stammdaten-Labels kommen aus
// leadFieldLabels (DRY).
const historyFieldLabels: Record<string, string> = {
  ...leadFieldLabels,
  status: "Status",
  crm_status_id: "CRM-Status",
  traffic_light_rating: "Ampel-Bewertung",
  traffic_light_score: "Ampel-Score",
  traffic_light_source: "Ampel-Quelle",
  traffic_light_reason: "Ampel-Begründung",
};

// Reine Maschinen-Metadaten – tragen keine für Menschen lesbare Info und werden
// in der Historie ausgeblendet (kommen pro Bewertung als Rausch-Zeile mit).
const HIDDEN_HISTORY_FIELDS = new Set(["traffic_light_rated_at", "updated_at"]);

const TRAFFIC_LIGHT_BY_VALUE = new Map<string, (typeof TRAFFIC_LIGHT_OPTIONS)[number]>(
  TRAFFIC_LIGHT_OPTIONS.map((o) => [o.value, o]),
);
const STATUS_LABEL_BY_VALUE = new Map<string, string>(
  LEAD_STATUS_OPTIONS.map((o) => [o.value, o.label]),
);
const SOURCE_LABELS: Record<string, string> = { ai: "KI", manual: "Manuell", api: "API" };
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Formatiert einen Roh-Wert aus lead_changes für die Anzeige (Pille, Datum, Label …).
 *  `muted` = alter Wert (gedämpft bzw. durchgestrichen). */
function HistoryValue({ field, value, muted }: { field: string; value: string | null; muted?: boolean }) {
  if (value == null || value === "") {
    return <span className="text-gray-400 dark:text-gray-500">–</span>;
  }

  // Ampel-Bewertung → farbige Pille mit Punkt
  if (field === "traffic_light_rating") {
    const opt = TRAFFIC_LIGHT_BY_VALUE.get(value);
    if (opt) {
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${opt.color} ${muted ? "opacity-50" : ""}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${opt.dot}`} />
          {opt.label}
        </span>
      );
    }
  }

  let text = value;
  if (field === "traffic_light_source") text = SOURCE_LABELS[value] ?? value;
  else if (field === "status") text = STATUS_LABEL_BY_VALUE.get(value) ?? value;
  else if (ISO_DATE_RE.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) text = d.toLocaleString("de-DE");
  }

  return (
    <span className={muted ? "text-gray-400 line-through dark:text-gray-500" : ""}>{text}</span>
  );
}

export function LeadChangesList({ changes }: { changes: LeadChange[] }) {
  const visible = changes.filter((c) => !HIDDEN_HISTORY_FIELDS.has(c.field_name));
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">Änderungshistorie</h2>
      {visible.length === 0 ? (
        <p className="mt-2 text-sm text-gray-400">Noch keine Änderungen.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {visible.map((change) => (
            <li key={change.id} className="border-l-2 border-gray-200 pl-3 text-sm dark:border-gray-700">
              <p className="font-medium text-gray-700 dark:text-gray-300">
                {historyFieldLabels[change.field_name] ?? change.field_name}
              </p>
              <p className="flex flex-wrap items-center gap-1.5 text-gray-500 dark:text-gray-400">
                {change.old_value != null && change.old_value !== "" ? (
                  <>
                    <HistoryValue field={change.field_name} value={change.old_value} muted />
                    <span aria-hidden className="text-gray-400 dark:text-gray-500">→</span>
                  </>
                ) : null}
                <HistoryValue field={change.field_name} value={change.new_value} />
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {new Date(change.created_at).toLocaleString("de-DE")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
