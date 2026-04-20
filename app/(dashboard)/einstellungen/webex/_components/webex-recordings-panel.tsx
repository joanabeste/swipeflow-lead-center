"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Loader2, Mic } from "lucide-react";
import { triggerRecordingSync } from "../../actions";
import { useToastContext } from "../../../toast-provider";

export function WebexRecordingsPanelBody({
  hasToken,
  fetchedLast24h,
  pendingCount,
}: {
  hasToken: boolean;
  fetchedLast24h: number;
  pendingCount: number;
}) {
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();
  const [legalOpen, setLegalOpen] = useState(false);

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
    <div>
      <dl className="grid gap-3 sm:grid-cols-3">
        <StatusRow
          label="Sync-Status"
          ok={hasToken}
          okText="Aktiv"
          nokText="Inaktiv — Token fehlt"
        />
        <Metric label="Aufzeichnungen (24h)" value={fetchedLast24h} />
        <Metric label="Ausstehend im Sync" value={pendingCount} />
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={handleSync}
          disabled={pending || !hasToken}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-[#2c2c2e] dark:hover:bg-white/5"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
          Jetzt synchronisieren
        </button>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Automatischer Sync 1× täglich (nachts 2 Uhr). Für Gespräche direkt nach dem Anruf
          bitte „Jetzt synchronisieren" drücken.
        </p>
      </div>

      <button
        onClick={() => setLegalOpen((v) => !v)}
        className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-orange-700 hover:underline dark:text-orange-400"
      >
        {legalOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        Rechtlicher Hinweis (§ 201 StGB, DSGVO)
      </button>
      {legalOpen && (
        <div className="mt-1.5 rounded-md border border-orange-200 bg-orange-50/50 p-3 text-xs text-orange-800 dark:border-orange-900/50 dark:bg-orange-900/20 dark:text-orange-300">
          Aufzeichnungen ohne Einwilligung der Gesprächspartner sind in Deutschland nach § 201 StGB
          strafbar und DSGVO-relevant. In Webex muss entweder ein Einwilligungs-Ansagetext aktiv
          sein oder du musst die Einwilligung explizit erfragen.
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-gray-100 p-3 dark:border-[#2c2c2e]">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}

function StatusRow({
  label,
  ok,
  okText,
  nokText,
}: {
  label: string;
  ok: boolean;
  okText: string;
  nokText: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-gray-100 p-3 dark:border-[#2c2c2e]">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
        <p
          className={`text-sm font-medium ${
            ok ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"
          }`}
        >
          {ok ? okText : nokText}
        </p>
      </div>
    </div>
  );
}
