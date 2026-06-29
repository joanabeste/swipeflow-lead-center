"use client";

import { useEffect, useState, useTransition } from "react";
import { Settings, Zap } from "lucide-react";
import { saveQualifySettings } from "@/app/(dashboard)/leads/actions";
import { useToastContext } from "@/app/(dashboard)/toast-provider";
import type { CustomLeadStatus } from "@/lib/types";
import type { QualifyHotkeySettings } from "@/lib/app-settings";

interface Props {
  statuses: CustomLeadStatus[];
  settings: QualifyHotkeySettings;
  onChange: (s: QualifyHotkeySettings) => void;
}

/**
 * Cockpit-Einstellung pro Nutzer (Zahnrad-Popover): legt fest, ob Taste „1" den
 * Lead sofort qualifiziert (→ CRM) und in welchen CRM-Status grün-qualifizierte
 * Leads wandern. Wird pro Nutzer gespeichert; bei Erfolg `onChange` → das Cockpit
 * übernimmt das neue Verhalten sofort.
 */
export function QualifySettings({ statuses, settings, onChange }: Props) {
  const { addToast } = useToastContext();
  const [open, setOpen] = useState(false);
  const [immediate, setImmediate] = useState(settings.immediateQualify);
  const [statusId, setStatusId] = useState(settings.targetStatusId);
  const [pending, startTransition] = useTransition();

  // Bei externem Settings-Wechsel (z.B. erneutes Öffnen) Formular synchron halten.
  useEffect(() => {
    setImmediate(settings.immediateQualify);
    setStatusId(settings.targetStatusId);
  }, [settings]);

  function save() {
    startTransition(async () => {
      const res = await saveQualifySettings({ immediateQualify: immediate, targetStatusId: statusId });
      if ("error" in res) {
        addToast(`Fehler: ${res.error}`, "error");
        return;
      }
      onChange({ immediateQualify: immediate, targetStatusId: statusId });
      addToast("Einstellung gespeichert", "success");
      setOpen(false);
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:border-[#2c2c2e] dark:text-gray-300 dark:hover:bg-white/5"
        title="Qualifizierungs-Einstellungen"
      >
        <Settings className="h-3.5 w-3.5" />
        {settings.immediateQualify ? (
          <span className="inline-flex items-center gap-1 text-primary">
            <Zap className="h-3.5 w-3.5" /> Sofort
          </span>
        ) : (
          "Einstellungen"
        )}
      </button>

      {open && (
        <>
          {/* Klick außerhalb schließt */}
          <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-[91] mt-2 w-80 rounded-xl border border-gray-200 bg-white p-4 shadow-xl dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={immediate}
                onChange={(e) => setImmediate(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#d2a966]"
              />
              <span className="text-sm">
                <span className="font-medium">{'Bei Taste „1" sofort qualifizieren'}</span>
                <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                  {'Der Lead wird direkt ins CRM übernommen. Aus = „1" markiert nur grün; das Qualifizieren läuft gesammelt über „Alle grünen qualifizieren".'}
                </span>
              </span>
            </label>

            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                Ziel-Status im CRM
              </label>
              <select
                value={statusId}
                onChange={(e) => setStatusId(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#161618]"
              >
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={save}
                disabled={pending || !statusId}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-gray-900 transition hover:bg-primary-dark disabled:opacity-40"
              >
                {pending ? "Speichert…" : "Speichern"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
