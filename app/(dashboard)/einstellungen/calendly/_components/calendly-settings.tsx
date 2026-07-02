"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle, Copy, Check, Loader2, AlertTriangle } from "lucide-react";
import {
  saveCalendlyTokenAction,
  registerCalendlyWebhookAction,
  disconnectCalendlyAction,
  saveEventMappingAction,
} from "../actions";

type StatusOption = { id: string; label: string; display_order: number; is_active: boolean };

type MappingRow = {
  eventTypeUri: string;
  eventTypeName: string;
  schedulingUrl: string | null;
  bookedStatusId: string | null;
  canceledStatusId: string | null;
  saved: boolean;
};

type Connection =
  | { configured: true; source: "db" | "env"; hasWebhook: boolean; callbackUrl: string | null; lastVerifyError: string | null }
  | { configured: false };

export function CalendlySettings({
  connection,
  webhookUrl,
  statuses,
  mappings,
  eventTypesError,
}: {
  connection: Connection;
  webhookUrl: string;
  statuses: StatusOption[];
  mappings: MappingRow[];
  eventTypesError: string | null;
}) {
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  function saveToken() {
    setMsg(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("token", token);
      const res = await saveCalendlyTokenAction(undefined, fd);
      if (res.error) setMsg({ kind: "err", text: res.error });
      else {
        setMsg({ kind: "ok", text: "Token gespeichert und verifiziert." });
        setToken("");
      }
    });
  }

  function registerWebhook() {
    setMsg(null);
    startTransition(async () => {
      const res = await registerCalendlyWebhookAction(webhookUrl);
      if (res.error) setMsg({ kind: "err", text: res.error });
      else setMsg({ kind: "ok", text: "Webhook bei Calendly registriert." });
    });
  }

  function disconnect() {
    if (!confirm("Calendly-Verbindung trennen? Der Webhook wird bei Calendly gelöscht.")) return;
    setMsg(null);
    startTransition(async () => {
      const res = await disconnectCalendlyAction();
      if (res.error) setMsg({ kind: "err", text: res.error });
      else setMsg({ kind: "ok", text: "Verbindung getrennt." });
    });
  }

  async function copyWebhookUrl() {
    await navigator.clipboard.writeText(webhookUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const configured = connection.configured;

  return (
    <div className="space-y-6">
      {msg && (
        <div
          className={`rounded-lg px-4 py-2.5 text-sm ${
            msg.kind === "ok"
              ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300"
              : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* ── Verbindung ─────────────────────────────────────────── */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e] dark:bg-[#161618]">
        <div className="mb-3 flex items-center gap-2">
          {configured ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> verbunden
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500 dark:bg-[#2c2c2e]">
              <XCircle className="h-3.5 w-3.5" /> nicht verbunden
            </span>
          )}
          {configured && connection.source === "env" && (
            <span className="text-xs text-gray-400">Quelle: Umgebungsvariable</span>
          )}
        </div>

        {configured && connection.lastVerifyError && (
          <p className="mb-3 flex items-center gap-1.5 text-xs text-amber-600">
            <AlertTriangle className="h-3.5 w-3.5" /> Letzter Fehler: {connection.lastVerifyError}
          </p>
        )}

        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Personal Access Token
        </label>
        <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
          In Calendly unter <em>Integrations → API &amp; Webhooks → Personal Access Tokens</em> erzeugen.
          Der Token wird verschlüsselt gespeichert.
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={configured ? "•••••••• (gesetzt — neu eingeben zum Ersetzen)" : "Token einfügen"}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-[#2c2c2e] dark:bg-[#1c1c1e]"
          />
          <button
            onClick={saveToken}
            disabled={pending || !token.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-gray-900 disabled:opacity-50"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Speichern
          </button>
        </div>

        {configured && (
          <button
            onClick={disconnect}
            disabled={pending}
            className="mt-3 text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
          >
            Verbindung trennen
          </button>
        )}
      </section>

      {/* ── Webhook ────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e] dark:bg-[#161618]">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Webhook</h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Registriert bei Calendly einen Webhook für <code>invitee.created</code> und{" "}
          <code>invitee.canceled</code> auf diese URL:
        </p>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 truncate rounded-lg bg-gray-50 px-3 py-2 text-xs dark:bg-[#1c1c1e]">
            {webhookUrl}
          </code>
          <button
            onClick={copyWebhookUrl}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-2 text-xs dark:border-[#2c2c2e]"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={registerWebhook}
            disabled={pending || !configured}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-gray-900 disabled:opacity-50"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {configured && connection.hasWebhook ? "Webhook neu registrieren" : "Webhook registrieren"}
          </button>
          {configured && connection.hasWebhook && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600">
              <CheckCircle2 className="h-3.5 w-3.5" /> aktiv
            </span>
          )}
        </div>
      </section>

      {/* ── Event-Typ → Status Mapping ─────────────────────────── */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e] dark:bg-[#161618]">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Termin-Typ → Lead-Status</h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Legt fest, welchen CRM-Status eine Buchung setzt. Der Status wird nur <strong>vorwärts</strong>{" "}
          gesetzt — ein Lead wird nie zurückgestuft.
        </p>

        {eventTypesError ? (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-amber-600">
            <AlertTriangle className="h-4 w-4" /> {eventTypesError}
          </p>
        ) : mappings.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">
            {configured ? "Keine aktiven Event-Typen gefunden." : "Zuerst Token hinterlegen."}
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {mappings.map((m) => (
              <MappingCard key={m.eventTypeUri} row={m} statuses={statuses} disabled={pending} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MappingCard({
  row,
  statuses,
  disabled,
}: {
  row: MappingRow;
  statuses: StatusOption[];
  disabled: boolean;
}) {
  const [booked, setBooked] = useState<string>(row.bookedStatusId ?? "");
  const [canceled, setCanceled] = useState<string>(row.canceledStatusId ?? "");
  const [saved, setSaved] = useState(row.saved);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function save() {
    setErr(null);
    startTransition(async () => {
      const res = await saveEventMappingAction({
        eventTypeUri: row.eventTypeUri,
        eventTypeName: row.eventTypeName,
        bookedStatusId: booked || null,
        canceledStatusId: canceled || null,
      });
      if (res.error) setErr(res.error);
      else setSaved(true);
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 p-4 dark:border-[#2c2c2e]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{row.eventTypeName}</p>
          {row.schedulingUrl && (
            <p className="truncate text-[11px] text-gray-400" title={row.schedulingUrl}>
              {row.schedulingUrl}
            </p>
          )}
        </div>
        {saved && <span className="text-[11px] font-medium text-green-600">gespeichert</span>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs">
          <span className="text-gray-500 dark:text-gray-400">Bei Buchung → Status</span>
          <select
            value={booked}
            onChange={(e) => { setBooked(e.target.value); setSaved(false); }}
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#1c1c1e]"
          >
            <option value="">— kein —</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="text-gray-500 dark:text-gray-400">Bei Absage → Status (optional)</span>
          <select
            value={canceled}
            onChange={(e) => { setCanceled(e.target.value); setSaved(false); }}
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#1c1c1e]"
          >
            <option value="">— kein —</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
      </div>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      <button
        onClick={save}
        disabled={disabled || pending}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-gray-900 disabled:opacity-50"
      >
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Speichern
      </button>
    </div>
  );
}
