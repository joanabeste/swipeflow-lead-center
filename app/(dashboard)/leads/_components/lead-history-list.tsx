import type { LeadChange } from "@/lib/types";
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

export function LeadChangesList({ changes }: { changes: LeadChange[] }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">Änderungshistorie</h2>
      {changes.length === 0 ? (
        <p className="mt-2 text-sm text-gray-400">Noch keine Änderungen.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {changes.map((change) => (
            <li key={change.id} className="border-l-2 border-gray-200 pl-3 text-sm dark:border-gray-700">
              <p className="font-medium text-gray-700 dark:text-gray-300">
                {leadFieldLabels[change.field_name] ?? change.field_name}
              </p>
              <p className="text-gray-500 dark:text-gray-400">
                <span className="line-through">{change.old_value ?? "–"}</span> → {change.new_value ?? "–"}
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
