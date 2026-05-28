"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Copy, Save, AlertCircle, CheckCircle2, BookOpen, ExternalLink } from "lucide-react";
import type { Profile } from "@/lib/types";
import { setUserPhonemondoExtension, setUserPhonemondoApiToken } from "./actions";
import { useToastContext } from "../toast-provider";

interface PhoneMondoStatus {
  hasToken: boolean;
  hasSecret: boolean;
  baseUrl: string;
}

// Token-Wert wird nie zum Client gegeben — nur ein "gesetzt"-Flag.
type ManagerProfile = Omit<Profile, "phonemondo_api_token"> & { hasPhonemondoToken: boolean };

export function PhonemondoManager({
  status,
  profiles,
  webhookUrl,
}: {
  status: PhoneMondoStatus;
  profiles: ManagerProfile[];
  webhookUrl: string;
}) {
  const configured = status.hasToken;
  const sortedProfiles = [...profiles]
    .filter((p) => p.status === "active")
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      {/* Anleitung */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-5 dark:border-blue-900/40 dark:bg-blue-900/10">
        <h3 className="flex items-center gap-2 font-semibold">
          <BookOpen className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          So richtest du Click-to-Call ein
        </h3>
        <ol className="mt-3 space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <li className="flex gap-2">
            <span className="font-semibold text-blue-600 dark:text-blue-400">1.</span>
            <span>
              <strong>API-Token holen (Team-Token).</strong> Im PhoneMondo-Portal unter{" "}
              <a
                href="https://www.phonemondo.com/portal/settings/apitoken/"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-0.5 font-medium text-blue-600 underline hover:no-underline dark:text-blue-400"
              >
                Einstellungen → API-Token <ExternalLink className="h-3 w-3" />
              </a>{" "}
              einen Token erzeugen. Diesen als <code className="rounded bg-white/60 px-1 dark:bg-black/30">PHONEMONDO_API_TOKEN</code>{" "}
              in Vercel (Production) bzw. <code className="rounded bg-white/60 px-1 dark:bg-black/30">.env.local</code> (lokal) hinterlegen.
              Danach Redeploy bzw. Dev-Server-Neustart. Status siehst du unten.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-blue-600 dark:text-blue-400">2.</span>
            <span>
              <strong>Webhook eintragen.</strong> Die untenstehende{" "}
              <strong>Webhook-URL</strong> im PhoneMondo-Portal hinterlegen, damit Anruf-Status
              (klingelt / angenommen / beendet) zurückgemeldet wird.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-blue-600 dark:text-blue-400">3.</span>
            <span>
              <strong>Source-UID pro Nutzer eintragen.</strong> Jeder Nutzer braucht die UID
              seiner Leitung (&bdquo;Source&ldquo;). Sie steht im PhoneMondo-Portal bei den{" "}
              <strong>Leitungen / Geräten</strong> — das ist die <strong>Leitungs-UID</strong>{" "}
              (z. B. <code className="rounded bg-white/60 px-1 dark:bg-black/30">HR9FDGdl2Q2lS4ca9</code>),
              <strong> nicht die Telefonnummer</strong>. Unten beim Nutzer ins Feld &bdquo;Source-UID&ldquo; eintragen und &bdquo;UID&ldquo; speichern.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-blue-600 dark:text-blue-400">4.</span>
            <span>
              <strong>Optional: eigener API-Token pro Nutzer.</strong> Soll ein Nutzer über sein
              <em> eigenes</em> PhoneMondo-Konto (eigene Lizenz) telefonieren, seinen persönlichen
              Token ins Feld &bdquo;API-Token&ldquo; eintragen. <strong>Leer lassen = Team-Token</strong> (Schritt 1) wird genutzt.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-blue-600 dark:text-blue-400">5.</span>
            <span>
              <strong>Leitung muss anrufbereit sein.</strong> In PhoneMondo muss die Leitung online
              sein (Status &bdquo;canStartCallNow&ldquo;). Bei Webex-Leitungen muss das Gerät verbunden sein —
              sonst schlägt der Anruf trotz korrekter UID fehl.
            </span>
          </li>
        </ol>
      </div>

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

      {/* User-Extensions */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
        <h3 className="font-semibold">PhoneMondo-Sources pro Nutzer</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Jeder Nutzer braucht die UID seines PhoneMondo-Telefons/Geräts
          (&bdquo;Source&ldquo;). Sie ist im PhoneMondo-Dashboard sichtbar und wird beim
          Click-to-Call mitgegeben, damit PhoneMondo weiß, welches Telefon
          zuerst klingeln soll. Der API-Token ist optional: leer lassen, um den
          Team-Token zu nutzen — oder einen eigenen Token hinterlegen, damit der
          Anruf über das eigene PhoneMondo-Konto läuft.
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
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              addToast("Kopiert", "success");
            } catch {
              addToast(`Kopieren nicht möglich — manuell: ${value}`, "error", { durationMs: 10000 });
            }
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

function ExtensionRow({ profile }: { profile: ManagerProfile }) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [value, setValue] = useState(profile.phonemondo_extension ?? "");
  const [pending, startTransition] = useTransition();
  const dirty = value !== (profile.phonemondo_extension ?? "");

  // Token: Klartext liegt nie vor, nur ob gesetzt. Leeres Feld + gesetzter Token
  // = unveraendert lassen; erst Tippen markiert "dirty".
  const [token, setToken] = useState("");
  const [tokenDirty, setTokenDirty] = useState(false);
  const [tokenPending, startTokenTransition] = useTransition();

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

  function saveToken() {
    startTokenTransition(async () => {
      const res = await setUserPhonemondoApiToken(profile.id, token.trim() || null);
      if (res.error) addToast(res.error, "error");
      else {
        addToast(
          token.trim()
            ? `API-Token für ${profile.name} gespeichert`
            : `API-Token für ${profile.name} entfernt (Team-Token)`,
          "success",
        );
        setToken("");
        setTokenDirty(false);
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
      <div className="flex items-center gap-1.5">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Source-UID"
          className="w-44 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#161618]"
        />
        <button
          onClick={save}
          disabled={!dirty || pending}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-primary-dark disabled:opacity-50"
        >
          {pending ? "…" : dirty ? <><Save className="h-3 w-3" />UID</> : <><Check className="h-3 w-3" />UID</>}
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="password"
          value={token}
          onChange={(e) => { setToken(e.target.value); setTokenDirty(true); }}
          placeholder={profile.hasPhonemondoToken ? "eigener Token gesetzt" : "API-Token (optional)"}
          autoComplete="off"
          className="w-52 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#161618]"
        />
        <button
          onClick={saveToken}
          disabled={!tokenDirty || tokenPending}
          title="Eigenen API-Token speichern (leer + Speichern = Team-Token nutzen)"
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-[#2c2c2e] dark:hover:bg-white/5"
        >
          {tokenPending ? "…" : <><Save className="h-3 w-3" />Token</>}
        </button>
      </div>
    </li>
  );
}
