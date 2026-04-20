"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";

export function WebexCallingPanelBody({
  hasScope,
}: {
  hasScope: boolean;
}) {
  return (
    <div>
      <div className="space-y-2">
        <Row
          ok={hasScope}
          okText="Scope `spark:calls_write` vorhanden — Click-to-Call aktiv"
          nokText="Scope `spark:calls_write` fehlt. Neuen Token mit diesem Scope erstellen, um Click-to-Call zu aktivieren."
        />
      </div>

      {hasScope && (
        <div className="mt-4 rounded-md bg-emerald-50 p-3 text-xs text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
          <strong>Hinweis:</strong> Der Webex-Anruf läuft über den User, dem der Token gehört.
          Stelle sicher, dass dieser User in Webex Calling als Anrufer registriert ist (Telefon,
          Webex-App oder SIP-Client online). Sonst schlägt der Dial fehl.
        </div>
      )}
    </div>
  );
}

function Row({ ok, okText, nokText }: { ok: boolean; okText: string; nokText: string }) {
  return (
    <div className="flex items-start gap-2">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      )}
      <p
        className={`text-sm ${
          ok ? "text-gray-700 dark:text-gray-300" : "text-amber-700 dark:text-amber-300"
        }`}
      >
        {ok ? okText : nokText}
      </p>
    </div>
  );
}
