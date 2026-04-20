"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { deleteWebexCredentials, reverifyWebex } from "../../actions";
import { useToastContext } from "../../../toast-provider";

export type WebexConnection =
  | {
      configured: true;
      source: "db" | "env";
      expiresAt: string | null;
      scopes: string[];
      lastVerifiedAt: string | null;
      lastVerifyError: string | null;
    }
  | { configured: false };

/**
 * Body-only: die Karten-Chrome (border/rounded/padding) kommt vom CollapsibleCard-Wrapper.
 * Rendert nur den Body-Inhalt des "Verbindung"-Panels (configured=true).
 */
export function WebexConnectionPanelBody({
  connection,
  onOpenWizard,
}: {
  connection: Extract<WebexConnection, { configured: true }>;
  onOpenWizard: () => void;
}) {
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();

  function handleReverify() {
    startTransition(async () => {
      const res = await reverifyWebex();
      if (!res.ok) addToast(res.error, "error");
      else
        addToast(
          `Token gültig · ${res.scopes.length} Scopes${res.personEmail ? ` · ${res.personEmail}` : ""}`,
          "success",
        );
    });
  }

  function handleDelete() {
    if (!confirm("Webex-Token wirklich löschen? Aufzeichnungs-Sync wird gestoppt.")) return;
    startTransition(async () => {
      const res = await deleteWebexCredentials();
      if (res.error) addToast(res.error, "error");
      else addToast("Token gelöscht.", "success");
    });
  }

  const expiresAt = connection.expiresAt ? new Date(connection.expiresAt) : null;
  // Einmalig beim Mount erfasst — der Token-Status ändert sich nicht zwischen Re-Renders.
  // Bei Langzeit-Anzeige reicht ein Route-Refresh zur Aktualisierung.
  const [now] = useState(() => Date.now());
  const expired = expiresAt ? expiresAt.getTime() < now : false;
  const expiringSoon = expiresAt ? !expired && expiresAt.getTime() - now < 2 * 3600_000 : false;

  return (
    <div>
      <dl className="grid gap-3 sm:grid-cols-3">
        <StatusCell
          label="Token-Status"
          ok={!expired && !connection.lastVerifyError}
          okText={expiringSoon ? "Gültig — läuft bald ab" : "Gültig"}
          nokText={expired ? "Abgelaufen — neu eintragen" : connection.lastVerifyError ?? "Unbekannt"}
        />
        <InfoCell
          label="Gültig bis"
          value={expiresAt ? expiresAt.toLocaleString("de-DE") : "—"}
        />
        <InfoCell
          label="Zuletzt geprüft"
          value={
            connection.lastVerifiedAt
              ? new Date(connection.lastVerifiedAt).toLocaleString("de-DE")
              : "Noch nie"
          }
        />
      </dl>

      <div className="mt-4">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Scopes</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {connection.scopes.length === 0 ? (
            <span className="text-xs text-gray-400">Nicht verfügbar (Env-Var-Modus)</span>
          ) : (
            connection.scopes.map((s) => (
              <span
                key={s}
                className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-mono text-gray-700 dark:bg-white/5 dark:text-gray-300"
              >
                {s}
              </span>
            ))
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={handleReverify}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-[#2c2c2e] dark:hover:bg-white/5"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Testen
        </button>
        <button
          onClick={onOpenWizard}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-[#2c2c2e] dark:hover:bg-white/5"
        >
          Token erneuern
        </button>
        <button
          onClick={handleDelete}
          disabled={pending}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Löschen
        </button>
      </div>
    </div>
  );
}

function StatusCell({
  label, ok, okText, nokText,
}: { label: string; ok: boolean; okText: string; nokText: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-gray-100 p-3 dark:border-[#2c2c2e]">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
        <p className={`text-sm font-medium ${ok ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
          {ok ? okText : nokText}
        </p>
      </div>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-gray-100 p-3 dark:border-[#2c2c2e]">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}
