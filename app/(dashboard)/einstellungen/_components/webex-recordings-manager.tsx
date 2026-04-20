"use client";

import { useTransition } from "react";
import { AlertCircle, CheckCircle2, Loader2, Mic, X } from "lucide-react";
import { triggerRecordingSync } from "../actions";
import { useToastContext } from "../../toast-provider";

export interface WebexRecordingStatus {
  hasToken: boolean;
  pendingCount: number;
  fetchedLast24h: number;
}

export function WebexRecordingsManager({ status }: { status: WebexRecordingStatus }) {
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();

  function handleSync() {
    startTransition(async () => {
      const res = await triggerRecordingSync();
      if ("error" in res) {
        addToast(res.error, "error");
      } else {
        const r = res.result as { matched?: number; checked?: number };
        addToast(
          `Sync abgeschlossen — ${r.matched ?? 0} Aufzeichnungen verknüpft (von ${r.checked ?? 0} Kandidaten).`,
          "success",
        );
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold">
              <Mic className="h-4 w-4 text-primary" />
              Aufzeichnungen (Webex Calling)
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Call-Recordings werden 1× täglich automatisch aus Webex abgeholt und den Calls
              im CRM zugeordnet. Für sofortige Zuordnung nach einem Gespräch den Button
              „Jetzt synchronisieren“ nutzen. Voraussetzung: Aufzeichnung in Webex/Placetel aktiviert und ein
              Personal Access Token in der Env-Var <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">WEBEX_CALLING_TOKEN</code>.
            </p>
          </div>
          <button
            onClick={handleSync}
            disabled={pending || !status.hasToken}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-[#2c2c2e] dark:hover:bg-white/5"
            title={status.hasToken ? "Manuell synchronisieren" : "WEBEX_CALLING_TOKEN fehlt"}
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
            Jetzt synchronisieren
          </button>
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <StatusRow
            label="Webex-Token (WEBEX_CALLING_TOKEN)"
            ok={status.hasToken}
            okText="Gesetzt"
            nokText="Fehlt — Recording-Sync deaktiviert"
          />
          <MetricRow label="Aufzeichnungen (24h)" value={status.fetchedLast24h} />
          <MetricRow label="Ausstehend im Sync" value={status.pendingCount} />
        </dl>

        {!status.hasToken && (
          <div className="mt-4 flex items-start gap-2 rounded-md bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              Token unter{" "}
              <a href="https://developer.webex.com" target="_blank" rel="noreferrer" className="underline">
                developer.webex.com
              </a>{" "}
              → My Apps → Personal Access Token erzeugen (Scopes{" "}
              <code className="rounded bg-white/50 px-1 dark:bg-black/20">spark-admin:callingRecordings_read</code> und{" "}
              <code className="rounded bg-white/50 px-1 dark:bg-black/20">_download</code>). Dann in Vercel als{" "}
              <code className="rounded bg-white/50 px-1 dark:bg-black/20">WEBEX_CALLING_TOKEN</code> setzen und redeployen.
            </div>
          </div>
        )}

        <div className="mt-3 rounded-md border border-orange-200 bg-orange-50/50 p-3 text-xs text-orange-800 dark:border-orange-900/50 dark:bg-orange-900/20 dark:text-orange-300">
          <p>
            <strong>Rechtlicher Hinweis:</strong> Aufzeichnungen ohne Einwilligung der Gesprächspartner
            sind in Deutschland nach § 201 StGB strafbar + DSGVO-relevant. In Webex muss entweder ein
            Einwilligungs-Ansagetext aktiv sein oder du musst die Einwilligung explizit erfragen.
          </p>
        </div>
      </div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-gray-100 p-3 dark:border-[#2c2c2e]">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}

function StatusRow({
  label, ok, okText, nokText,
}: { label: string; ok: boolean; okText: string; nokText: string }) {
  const iconColor = ok ? "text-emerald-500" : "text-red-500";
  const textColor = ok ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300";
  return (
    <div className="flex items-start gap-2 rounded-md border border-gray-100 p-3 dark:border-[#2c2c2e]">
      {ok ? <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} /> : <X className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} />}
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
        <p className={`text-sm font-medium ${textColor}`}>{ok ? okText : nokText}</p>
      </div>
    </div>
  );
}
