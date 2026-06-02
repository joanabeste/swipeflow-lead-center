"use client";

import { useState } from "react";
import { Send, X } from "lucide-react";
import type { CustomLeadStatus } from "@/lib/types";

interface Props {
  /** Anzahl der zu verschiebenden Leads — steuert nur die Texte (Singular/Plural). */
  count: number;
  /** Auswählbare CRM-Status (bereits auf aktive, nicht-archivierte der Vertikale gefiltert). */
  statuses: CustomLeadStatus[];
  /** Vorauswahl — i.d.R. der bisherige Default („… Manuelle Überprüfung"). */
  defaultStatusId: string | null;
  onCancel: () => void;
  onConfirm: (crmStatusId: string) => void;
}

/**
 * Inhalt des „Ins CRM verschieben"-Popups (gerendert via useDialog().show()).
 * Lässt den CRM-Zielstatus wählen, bevor Leads aus „Neue Leads" ins CRM wandern —
 * statt stillschweigend den Default („Webdesign — Manuelle Überprüfung") zu setzen.
 */
export function MoveToCrmStatusPicker({ count, statuses, defaultStatusId, onCancel, onConfirm }: Props) {
  // Vorauswahl: bisheriger Default, falls er in der Liste ist — dann hält ein
  // schnelles Bestätigen das alte Verhalten. Sonst erster verfügbarer Status.
  const initial =
    (defaultStatusId && statuses.some((s) => s.id === defaultStatusId) ? defaultStatusId : null) ??
    statuses[0]?.id ??
    "";
  const [selected, setSelected] = useState<string>(initial);

  const noStatuses = statuses.length === 0;

  return (
    <div>
      <header className="flex items-start justify-between gap-3 border-b border-gray-100 px-6 py-4 dark:border-[#2c2c2e]/50">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {count === 1 ? "Lead ins CRM verschieben" : `${count} Leads ins CRM verschieben`}
          </h3>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Wähle den CRM-Status, mit dem {count === 1 ? "der Lead" : "die Leads"} im CRM {count === 1 ? "landet" : "landen"}.
          </p>
        </div>
        <button
          onClick={onCancel}
          aria-label="Schließen"
          className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="px-6 py-4">
        {noStatuses ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Für diese Vertikale ist kein CRM-Status hinterlegt. Lege zuerst unter
            Einstellungen → CRM-Status einen an.
          </p>
        ) : (
          <>
            <label htmlFor="crm-status-select" className="block text-sm font-medium text-gray-900 dark:text-gray-100">
              CRM-Status
            </label>
            <select
              id="crm-status-select"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              autoFocus
              className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e] dark:text-gray-100"
            >
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-gray-100 px-6 py-3 dark:border-[#2c2c2e]/50">
        <button
          onClick={onCancel}
          className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
        >
          Abbrechen
        </button>
        <button
          onClick={() => selected && onConfirm(selected)}
          disabled={noStatuses || !selected}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition hover:bg-primary-dark disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
          Ins CRM verschieben
        </button>
      </footer>
    </div>
  );
}
