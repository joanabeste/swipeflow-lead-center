import Link from "next/link";
import { PowerOff } from "lucide-react";
import type { CustomStatusOption } from "../actions";

export function TopBar({
  customStatuses,
  selectedStatusIds,
  statusSaving,
  onToggleStatus,
  onHardStop,
  queueRunning,
}: {
  customStatuses: CustomStatusOption[];
  selectedStatusIds: string[];
  statusSaving: boolean;
  onToggleStatus: (id: string) => void;
  onHardStop: () => void;
  queueRunning: boolean;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            In der Queue: CRM-Status
          </p>
          {customStatuses.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">
              Noch keine custom CRM-Status angelegt.{" "}
              <Link href="/einstellungen/crm-status" className="font-medium text-primary hover:underline">
                Jetzt erstellen →
              </Link>
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {customStatuses.map((s) => {
                const selected = selectedStatusIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onToggleStatus(s.id)}
                    disabled={statusSaving}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-[#2c2c2e] dark:bg-[#161618] dark:text-gray-300"
                    } disabled:opacity-50`}
                    title={selected ? "Aus Queue entfernen" : "Zur Queue hinzufügen"}
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: s.color || "#6b7280" }}
                    />
                    {s.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onHardStop}
          disabled={!queueRunning}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
            queueRunning
              ? "bg-red-600 text-white hover:bg-red-700"
              : "bg-gray-100 text-gray-400 dark:bg-white/5 dark:text-gray-600"
          } disabled:cursor-not-allowed`}
          title={queueRunning ? "Aktiven Call abbrechen und Queue anhalten" : "Queue läuft nicht"}
        >
          <PowerOff className="h-4 w-4" />
          Queue beenden
        </button>
      </div>
    </div>
  );
}
