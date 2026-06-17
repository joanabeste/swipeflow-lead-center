"use client";

import { Clock, X } from "lucide-react";
import { addDays, formatTime, todayKey } from "../_lib/date-utils";

interface Props {
  /** Aktuelles Datum (YYYY-MM-DD). */
  date: string;
  /** Aktuelle Uhrzeit ("HH:MM") oder null = ganztägig. */
  time: string | null;
  /** Wird bei jeder Änderung mit dem neuen Entwurf aufgerufen (kein Persist). */
  onChange: (date: string, time: string | null) => void;
  /** Schließt das Popover (Outside-Click oder „Fertig"). */
  onClose: () => void;
  align?: "left" | "right";
}

const TIME_PRESETS = ["09:00", "13:00", "16:00"];

/**
 * Reiner Datum-/Uhrzeit-Editor als Popover. Persistiert NICHT selbst — meldet
 * Änderungen nur via onChange. Wiederverwendet in Quick-Add, Reschedule,
 * Inline-Editor und CRM-Composer (eine Quelle der Wahrheit).
 */
export function DateTimePopover({ date, time, onChange, onClose, align = "right" }: Props) {
  const today = todayKey();
  const datePresets: { label: string; value: string }[] = [
    { label: "Heute", value: today },
    { label: "Morgen", value: addDays(today, 1) },
    { label: "+3 Tage", value: addDays(today, 3) },
    { label: "+7 Tage", value: addDays(today, 7) },
    { label: "+14 Tage", value: addDays(today, 14) },
  ];
  const t = formatTime(time);

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div
        className={`absolute top-full z-20 mt-1 w-56 rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-[#2c2c2e] dark:bg-[#1c1c1e] ${
          align === "right" ? "right-0" : "left-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Datums-Presets */}
        <div className="grid grid-cols-2 gap-1">
          {datePresets.map((p) => (
            <button
              key={p.label}
              onClick={() => onChange(p.value, time)}
              className={`flex items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-primary/5 ${
                p.value === date ? "bg-primary/10 font-medium text-primary" : ""
              }`}
            >
              <span>{p.label}</span>
              <span className="text-gray-400">{formatShort(p.value)}</span>
            </button>
          ))}
        </div>

        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && onChange(e.target.value, time)}
          className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs dark:border-[#2c2c2e] dark:bg-[#161618] dark:[color-scheme:dark]"
        />

        <div className="my-2 border-t border-gray-100 dark:border-[#2c2c2e]" />

        {/* Uhrzeit */}
        <div className="flex items-center gap-1.5 px-0.5">
          <Clock className="h-3 w-3 text-gray-400" />
          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Uhrzeit
          </span>
          {t && (
            <button
              onClick={() => onChange(date, null)}
              className="ml-auto inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[11px] text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              title="Uhrzeit entfernen (ganztägig)"
            >
              <X className="h-2.5 w-2.5" />
              Keine
            </button>
          )}
        </div>
        <div className="mt-1 flex items-center gap-1">
          {TIME_PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => onChange(date, p)}
              className={`flex-1 rounded px-1.5 py-1 text-xs hover:bg-primary/5 ${
                t === p ? "bg-primary/10 font-medium text-primary" : "text-gray-600 dark:text-gray-300"
              }`}
            >
              {p}
            </button>
          ))}
          <input
            type="time"
            value={t ?? ""}
            onChange={(e) => onChange(date, e.target.value || null)}
            className="w-[72px] rounded-md border border-gray-200 bg-white px-1.5 py-1 text-xs dark:border-[#2c2c2e] dark:bg-[#161618] dark:[color-scheme:dark]"
          />
        </div>

        <button
          onClick={onClose}
          className="mt-2 w-full rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-gray-900 hover:bg-primary-dark"
        >
          Fertig
        </button>
      </div>
    </>
  );
}

function formatShort(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y.slice(2)}`;
}
