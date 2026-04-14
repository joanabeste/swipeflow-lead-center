"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Copy, Save, AlertCircle, CheckCircle2, Loader2, Mic } from "lucide-react";
import type { Profile } from "@/lib/types";
import { setUserPhonemondoExtension, triggerRecordingSync } from "./actions";
import { useToastContext } from "../toast-provider";

interface PhoneMondoStatus {
  hasToken: boolean;
  hasSecret: boolean;
  baseUrl: string;
}

export interface WebexRecordingStatus {
  hasToken: boolean;
  pendingCount: number;
  fetchedLast24h: number;
}

export function PhonemondoManager({
  status,
  profiles,
  webhookUrl,
  recordingStatus,
}: {
  status: PhoneMondoStatus;
  profiles: Profile[];
  webhookUrl: string;
  recordingStatus: WebexRecordingStatus;
}) {
  const configured = status.hasToken;
  const sortedProfiles = [...profiles]
    .filter((p) => p.status === "active")
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      {/* Status-Card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
        <h3 className="font-semibold">Integration-Status</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Server-seitige Konfiguration. Änderungen in den Environment-Variablen
          benötigen einen Neustart des Dev-Servers bzw. ein Redeploy auf Vercel.
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <StatusRow
            label="API-Token (PHONEMONDO_API_TOKEN)"
            ok={status.hasToken}
            okText="Gesetzt"
            nokText="Fehlt — Click-to-Call funktioniert nicht"
          />
          <StatusRow
            label="Webhook-Secret (PHONEMONDO_WEBHOOK_SECRET)"
            ok={status.hasSecret}
            okText="Gesetzt — Webhooks werden signaturgeprüft"
            nokText="Optional — nur nötig, wenn PhoneMondo Webhooks signiert sendet"
            neutral={!status.hasSecret}
          />
        </dl>

        <div className="mt-4 space-y-2 border-t border-gray-100 pt-4 dark:border-[#2c2c2e]">
          <LabeledRow label="API-Base-URL" value={status.baseUrl} />
          <LabeledRow
            label="Webhook-URL (im PhoneMondo-Dashboard eintragen)"
            value={webhookUrl}
            copy
          />
        </div>

        {!configured && (
          <div className="mt-4 flex items-start gap-2 rounded-md bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              Trage in der <code className="rounded bg-white/50 px-1 dark:bg-black/20">.env.local</code>{" "}
              folgende Zeilen ein und starte den Dev-Server neu:
              <pre className="mt-1 whitespace-pre-wrap font-mono">
PHONEMONDO_API_TOKEN=dein-token
PHONEMONDO_WEBHOOK_SECRET=dein-secret
PHONEMONDO_API_BASE_URL=https://api.phonemondo.com
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Aufzeichnungen (Webex Calling API) */}
      <RecordingsCard recordingStatus={recordingStatus} />

      {/* User-Extensions */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
        <h3 className="font-semibold">PhoneMondo-Sources pro Nutzer</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Jeder Nutzer braucht die UID seines PhoneMondo-Telefons/Geräts
          („Source"). Sie ist im PhoneMondo-Dashboard sichtbar und wird beim
          Click-to-Call mitgegeben, damit PhoneMondo weiß, welches Telefon
          zuerst klingeln soll.
        </p>
        <ul className="mt-4 divide-y divide-gray-100 dark:divide-[#2c2c2e]">
          {sortedProfiles.map((p) => (
            <ExtensionRow key={p.id} profile={p} />
          ))}
          {sortedProfiles.length === 0 && (
            <li className="py-3 text-sm text-gray-400">Keine Nutzer vorhanden.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function RecordingsCard({ recordingStatus }: { recordingStatus: WebexRecordingStatus }) {
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
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <Mic className="h-4 w-4 text-primary" />
            Aufzeichnungen (Webex Calling)
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Call-Recordings werden alle 2 Min automatisch aus Webex abgeholt und den Calls
            im CRM zugeordnet. Voraussetzung: Aufzeichnung in Webex/Placetel aktiviert und ein
            Personal Access Token in der Env-Var <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">WEBEX_CALLING_TOKEN</code>.
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={pending || !recordingStatus.hasToken}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-[#2c2c2e] dark:hover:bg-white/5"
          title={recordingStatus.hasToken ? "Manuell synchronisieren" : "WEBEX_CALLING_TOKEN fehlt"}
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
          Jetzt synchronisieren
        </button>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <StatusRow
          label="Webex-Token (WEBEX_CALLING_TOKEN)"
          ok={recordingStatus.hasToken}
          okText="Gesetzt"
          nokText="Fehlt — Recording-Sync deaktiviert"
        />
        <MetricRow label="Aufzeichnungen (24h)" value={recordingStatus.fetchedLast24h} />
        <MetricRow label="Ausstehend im Sync" value={recordingStatus.pendingCount} />
      </dl>

      {!recordingStatus.hasToken && (
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
  label, ok, okText, nokText, neutral = false,
}: { label: string; ok: boolean; okText: string; nokText: string; neutral?: boolean }) {
  const iconColor = ok ? "text-emerald-500" : neutral ? "text-gray-400" : "text-red-500";
  const textColor = ok
    ? "text-emerald-700 dark:text-emerald-300"
    : neutral
    ? "text-gray-600 dark:text-gray-400"
    : "text-red-700 dark:text-red-300";
  return (
    <div className="flex items-start gap-2 rounded-md border border-gray-100 p-3 dark:border-[#2c2c2e]">
      {ok ? (
        <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} />
      ) : neutral ? (
        <AlertCircle className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} />
      ) : (
        <X className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} />
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
        <p className={`text-sm font-medium ${textColor}`}>{ok ? okText : nokText}</p>
      </div>
    </div>
  );
}

function LabeledRow({
  label, value, copy,
}: { label: string; value: string; copy?: boolean }) {
  const { addToast } = useToastContext();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}:</span>
      <code className="flex-1 truncate rounded bg-gray-100 px-2 py-1 text-xs dark:bg-gray-800">
        {value}
      </code>
      {copy && (
        <button
          onClick={() => {
            navigator.clipboard.writeText(value);
            addToast("Kopiert", "success");
          }}
          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          title="Kopieren"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function ExtensionRow({ profile }: { profile: Profile }) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [value, setValue] = useState(profile.phonemondo_extension ?? "");
  const [pending, startTransition] = useTransition();
  const dirty = value !== (profile.phonemondo_extension ?? "");

  function save() {
    startTransition(async () => {
      const res = await setUserPhonemondoExtension(profile.id, value);
      if (res.error) addToast(res.error, "error");
      else {
        addToast(`Durchwahl für ${profile.name} gespeichert`, "success");
        router.refresh();
      }
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{profile.name}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{profile.email}</p>
      </div>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Source-UID"
        className="w-48 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#161618]"
      />
      <button
        onClick={save}
        disabled={!dirty || pending}
        className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
      >
        {pending ? "…" : dirty ? <><Save className="h-3 w-3" />Speichern</> : <><Check className="h-3 w-3" />Aktuell</>}
      </button>
    </li>
  );
}
