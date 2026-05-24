"use client";

import { useState, useTransition } from "react";
import { History, Zap, Loader2 } from "lucide-react";
import {
  setBackfillDaysAction,
  requestDeepSyncAction,
  syncMyMailbox,
} from "../../fulfillment/mail-actions";
import { useToastContext } from "../../toast-provider";

const PRESETS: Array<{ label: string; value: number }> = [
  { label: "30 Tage", value: 30 },
  { label: "90 Tage", value: 90 },
  { label: "365 Tage", value: 365 },
  { label: "Alles", value: 0 },
];

export function BackfillCard({ initial }: { initial: { days: number; deepSyncPending: boolean } }) {
  const { addToast } = useToastContext();
  const [days, setDays] = useState<number>(initial.days);
  const [savePending, startSave] = useTransition();
  const [deepPending, startDeep] = useTransition();
  const [syncing, startSync] = useTransition();

  function handleSaveDays(next: number) {
    setDays(next);
    startSave(async () => {
      const res = await setBackfillDaysAction(next);
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      addToast("Historie-Einstellung gespeichert.", "success");
    });
  }

  function handleDeepSync() {
    if (
      !confirm(
        "Tieferen Sync starten? Beim nächsten Synchronisieren werden alle Mails der gewählten Historie neu geladen — kann je nach Postfach-Größe ein paar Minuten dauern.",
      )
    ) {
      return;
    }
    startDeep(async () => {
      const res = await requestDeepSyncAction();
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      addToast(`Deep-Sync angefordert. Jetzt "Synchronisieren" drücken.`, "success");
    });
  }

  function handleSyncNow() {
    startSync(async () => {
      const res = await syncMyMailbox();
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      addToast(`Sync: ${res.inbox} eingehend, ${res.sent} gesendet.`, "success");
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">Historie laden</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Wie weit soll der Sync beim ersten Lauf zurückgehen? Bestehende Mails bleiben unverändert.
        </p>
        <div className="mt-2 inline-flex rounded-xl border border-gray-200 bg-white p-1 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#232325]">
          {PRESETS.map((p) => {
            const active = p.value === days;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => handleSaveDays(p.value)}
                disabled={savePending}
                className={`rounded-lg px-3 py-1.5 font-medium transition ${
                  active ? "bg-primary text-gray-900 shadow-sm" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-gray-200 p-3 dark:border-[#2c2c2e]/60">
        <p className="text-sm font-medium">Tieferen Sync starten</p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          Einmaliger Backfill mit der oben gewählten Historie — ignoriert den UID-Cursor und lädt
          alles in der gewählten Zeitspanne neu. Pro Run werden bis zu 2000 Mails verarbeitet; bei
          größeren Archiven mehrfach syncen.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDeepSync}
            disabled={deepPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-[#2c2c2e] dark:bg-[#232325] dark:hover:bg-white/5"
          >
            {deepPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <History className="h-3.5 w-3.5" />}
            {deepPending ? "Markiere…" : "Deep-Sync anfordern"}
          </button>
          <button
            type="button"
            onClick={handleSyncNow}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-primary-dark disabled:opacity-50"
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            {syncing ? "Sync läuft…" : "Jetzt synchronisieren"}
          </button>
          {initial.deepSyncPending && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              Deep-Sync ist vorgemerkt — beim nächsten Synchronisieren wird er ausgeführt.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
