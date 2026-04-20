"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  AlertCircle, Check, CheckCircle2, ChevronLeft, ChevronRight, Clipboard,
  ClipboardCheck, ExternalLink, Eye, EyeOff, Info, Loader2, X,
} from "lucide-react";
import { saveWebexCredentials, testWebexToken } from "../../actions";
import { useToastContext } from "../../../toast-provider";

type VerifyOk = {
  ok: true;
  scopes: string[];
  personEmail: string | null;
  displayName: string | null;
  missingRequiredScopes: string[];
  hasTranscriptsScope: boolean;
  hasCallingScope: boolean;
};

type VerifyResult = VerifyOk | { ok: false; error: string };

const REQUIRED_SCOPES = [
  "spark-admin:callingRecordings_read",
  "spark-admin:callingRecordings_download",
] as const;
const OPTIONAL_SCOPES = [
  { name: "spark-admin:transcripts_read", purpose: "Transkripte" },
  { name: "spark:calls_write", purpose: "Click-to-Call" },
] as const;

export function WebexSetupWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<Record<number, boolean>>({});

  const steps = [
    { key: "plan", title: "Webex Calling verfügbar?" },
    { key: "recording", title: "Aufzeichnungen aktivieren" },
    { key: "ai", title: "AI Assistant aktivieren (optional)" },
    { key: "token", title: "Token erzeugen" },
    { key: "save", title: "Token eintragen & testen" },
  ] as const;

  const isLast = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        <header className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-[#2c2c2e]">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Schritt {step + 1} von {steps.length}
            </p>
            <h2 className="mt-0.5 text-lg font-semibold">{steps[step].title}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/5"
            aria-label="Schließen"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <nav className="flex items-center gap-2 border-b border-gray-100 px-6 py-3 dark:border-[#2c2c2e]">
          {steps.map((s, i) => {
            const status =
              i < step ? "past" : i === step ? "current" : "future";
            const marker =
              done[i] || i < step ? (
                <Check className="h-3 w-3 text-white" />
              ) : (
                <span className="text-[10px] font-semibold">{i + 1}</span>
              );
            const circleBg =
              status === "current"
                ? "bg-primary text-gray-900"
                : done[i] || status === "past"
                ? "bg-emerald-500 text-white"
                : "bg-gray-200 text-gray-500 dark:bg-white/10 dark:text-gray-400";
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setStep(i)}
                className="group flex flex-1 items-center gap-1.5"
                title={s.title}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${circleBg}`}>
                  {marker}
                </span>
                <span
                  className={`flex-1 truncate text-[11px] font-medium ${
                    status === "current" ? "text-gray-900 dark:text-gray-100" : "text-gray-400"
                  }`}
                >
                  {s.title.split(" ")[0]}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 0 && <PlanStep />}
          {step === 1 && <RecordingStep />}
          {step === 2 && <AIStep />}
          {step === 3 && <TokenStep />}
          {step === 4 && <SaveStep onSavedClose={onClose} />}

          {!isLast && (
            <label className="mt-5 flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-gray-200 bg-gray-50/50 px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 dark:border-[#2c2c2e] dark:bg-white/[0.02] dark:text-gray-400 dark:hover:bg-white/5">
              <input
                type="checkbox"
                checked={!!done[step]}
                onChange={(e) => setDone((s) => ({ ...s, [step]: e.target.checked }))}
                className="h-3.5 w-3.5 rounded accent-emerald-500"
              />
              Schritt als erledigt markieren (optional)
            </label>
          )}
        </div>

        {!isLast && (
          <footer className="flex items-center justify-between border-t border-gray-100 px-6 py-4 dark:border-[#2c2c2e]">
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-300 dark:hover:bg-white/5"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Zurück
            </button>
            <button
              onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-primary-dark"
            >
              Weiter
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

function PlanStep() {
  return (
    <>
      <WhyBox>
        Aufzeichnungen, Transkripte und Click-to-Call stehen nur mit <strong>Webex Calling</strong>
        zur Verfügung. Webex Meetings allein reicht nicht.
      </WhyBox>
      <ol className="mt-4 space-y-2 text-sm text-gray-700 dark:text-gray-300">
        <Li>
          <ExtLink href="https://admin.webex.com/services">admin.webex.com → Services</ExtLink> öffnen.
        </Li>
        <Li>Prüfe, dass die Kachel <Kbd>Calling</Kbd> erscheint und aktiv ist.</Li>
        <Li>Fehlt sie? Webex-Partner kontaktieren, um Calling freizuschalten.</Li>
      </ol>
    </>
  );
}

function RecordingStep() {
  return (
    <>
      <WhyBox>
        Nur aufgezeichnete Anrufe landen im CRM. Die Aufzeichnungs-Policy wird pro User
        festgelegt — mindestens für alle Sales-/Support-User aktivieren.
      </WhyBox>
      <ol className="mt-4 space-y-2 text-sm text-gray-700 dark:text-gray-300">
        <Li>
          <ExtLink href="https://admin.webex.com/calling/features">
            admin.webex.com → Calling → Features
          </ExtLink>{" "}
          → <Kbd>Call Recording</Kbd>.
        </Li>
        <Li>Recording-Provider <Kbd>Webex</Kbd> auswählen (native Speicherung).</Li>
        <Li>
          Unter <Kbd>Users</Kbd> betroffene Anrufer:innen anhaken, Modus <Kbd>Always</Kbd> oder{" "}
          <Kbd>On Demand with User Initiated Start</Kbd>.
        </Li>
        <Li>
          <strong>Pflicht (DSGVO):</strong> Einwilligungs-Ansage aktivieren oder Einwilligung
          außerhalb von Webex einholen.
        </Li>
      </ol>
      <Hint tone="warn">
        Aufzeichnungen ohne Einwilligung sind in Deutschland nach § 201 StGB strafbar. Der
        Ansage-Text muss klar machen, dass das Gespräch aufgezeichnet wird.
      </Hint>
    </>
  );
}

function AIStep() {
  return (
    <>
      <WhyBox>
        Transkripte werden nur erzeugt, wenn der <strong>AI Assistant</strong> aktiv ist. Ohne
        AI Assistant funktioniert Aufzeichnung trotzdem — es fehlt nur das Transkript.
      </WhyBox>
      <ol className="mt-4 space-y-2 text-sm text-gray-700 dark:text-gray-300">
        <Li>
          <ExtLink href="https://admin.webex.com/services">admin.webex.com → Services</ExtLink> → <Kbd>AI Assistant</Kbd>.
        </Li>
        <Li><Kbd>Enable Webex AI Assistant</Kbd> einschalten.</Li>
        <Li>
          Feature <Kbd>Meeting &amp; Call Summary</Kbd> aktivieren — das erzeugt Transkript + Zusammenfassung.
        </Li>
        <Li>Nutzer unter <Kbd>User Assignment</Kbd> für AI Assistant lizenzieren.</Li>
      </ol>
      <Hint tone="info">
        <strong>Optional:</strong> Wenn du nur Audio-Aufzeichnungen brauchst, kannst du diesen
        Schritt überspringen.
      </Hint>
    </>
  );
}

function TokenStep() {
  return (
    <>
      <WhyBox>
        Der Personal Access Token autorisiert das Lead Center bei Webex. Gültigkeit:{" "}
        <strong>12 Stunden</strong> — danach neu eintragen.
      </WhyBox>
      <ol className="mt-4 space-y-2 text-sm text-gray-700 dark:text-gray-300">
        <Li>
          <ExtLink href="https://developer.webex.com/docs/api/v1/people/get-my-own-details">
            developer.webex.com öffnen
          </ExtLink>{" "}
          — mit Admin-Account anmelden.
        </Li>
        <Li>
          Oben im grauen <Kbd>Try It</Kbd>-Bereich erscheint dein Token neben <Kbd>Bearer</Kbd> —
          mit dem Copy-Button kopieren.
        </Li>
        <Li>
          Token ist <em>sehr lang</em> (&gt; 200 Zeichen) und beginnt typischerweise mit{" "}
          <Kbd>OWZi…</Kbd> oder <Kbd>NTVk…</Kbd>.
        </Li>
      </ol>

      <div className="mt-4 space-y-1 rounded-md border border-gray-200 bg-gray-50 p-3 text-xs dark:border-[#2c2c2e] dark:bg-white/5">
        <p className="font-medium text-gray-700 dark:text-gray-300">
          Benötigte Scopes — zum Kopieren in Webex:
        </p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Beim Erzeugen des Tokens diese Scopes ankreuzen:
        </p>
        <ul className="mt-2 space-y-1">
          {REQUIRED_SCOPES.map((s) => (
            <ScopeRow key={s} scope={s} required />
          ))}
          {OPTIONAL_SCOPES.map((s) => (
            <ScopeRow key={s.name} scope={s.name} purpose={s.purpose} />
          ))}
        </ul>
      </div>
    </>
  );
}

function ScopeRow({ scope, required, purpose }: { scope: string; required?: boolean; purpose?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(scope);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard-API nicht verfügbar — Nutzer muss manuell kopieren.
    }
  }
  return (
    <li className="flex items-center gap-1.5">
      <button
        onClick={copy}
        type="button"
        className="group inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-mono text-gray-700 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-white/10"
        title="Scope-Name kopieren"
      >
        {copied ? (
          <ClipboardCheck className="h-3 w-3 text-emerald-500" />
        ) : (
          <Clipboard className="h-3 w-3 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
        )}
        {scope}
      </button>
      {required ? (
        <span className="rounded bg-red-100 px-1 text-[10px] font-semibold uppercase tracking-wider text-red-700 dark:bg-red-900/40 dark:text-red-300">
          Pflicht
        </span>
      ) : (
        <span className="text-[11px] text-gray-500 dark:text-gray-400">({purpose})</span>
      )}
    </li>
  );
}

function SaveStep({ onSavedClose }: { onSavedClose: () => void }) {
  const { addToast } = useToastContext();
  const [token, setToken] = useState("");
  const [show, setShow] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [testing, startTest] = useTransition();
  const [state, formAction, saving] = useActionState(saveWebexCredentials, undefined);
  const lastTestedRef = useRef<string>("");

  function runTest(candidate: string) {
    const clean = candidate.trim();
    if (!clean || clean === lastTestedRef.current) return;
    lastTestedRef.current = clean;
    startTest(async () => {
      const res = await testWebexToken(clean);
      setVerifyResult(res);
    });
  }

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setToken(text.trim());
        setVerifyResult(null);
        // Automatischer Test nach Paste — gibt dem Nutzer direkt Feedback.
        runTest(text);
      }
    } catch {
      addToast("Zwischenablage nicht lesbar — bitte manuell einfügen (⌘V / Strg+V).", "error");
    }
  }

  const verifiedOk = verifyResult?.ok && verifyResult.missingRequiredScopes.length === 0;

  useEffect(() => {
    if (!state?.success) return;
    const t = setTimeout(onSavedClose, 800);
    return () => clearTimeout(t);
  }, [state?.success, onSavedClose]);

  return (
    <div className="space-y-4">
      <WhyBox>
        Token einfügen — wir testen ihn automatisch und zeigen Gültigkeit, Scopes und Besitzer.
        Speichern ist erst aktiv, wenn die Pflicht-Scopes vorhanden sind.
      </WhyBox>

      <form action={formAction} className="space-y-3">
        <div className="flex items-center justify-between">
          <label htmlFor="webex-token" className="text-sm font-medium">
            Webex Personal Access Token
          </label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handlePaste}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
              title="Aus Zwischenablage einfügen"
            >
              <Clipboard className="h-3 w-3" />
              Einfügen
            </button>
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
              title={show ? "Verbergen" : "Anzeigen"}
            >
              {show ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {show ? "Verbergen" : "Anzeigen"}
            </button>
          </div>
        </div>
        <input
          id="webex-token"
          name="token"
          type={show ? "text" : "password"}
          autoComplete="off"
          spellCheck={false}
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            if (e.target.value.trim() !== lastTestedRef.current) setVerifyResult(null);
          }}
          onBlur={() => runTest(token)}
          placeholder="OWZi…"
          className="w-full rounded-md border border-gray-300 bg-white p-2.5 font-mono text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-[#2c2c2e] dark:bg-[#161618]"
        />
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Token wird beim Verlassen des Felds automatisch getestet. Ca. 200 Zeichen, beginnt mit
          <Kbd>OWZi…</Kbd> oder ähnlich.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={!verifiedOk || saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Speichern &amp; fertig
          </button>
          {testing && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              Teste Token…
            </span>
          )}
          {!verifyResult && !testing && !token.trim() && (
            <span className="text-xs text-gray-400">Token einfügen, um zu testen.</span>
          )}
        </div>

        {state?.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {state.error}
          </p>
        )}
        {state?.success && (
          <p className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Gespeichert — Fenster schließt automatisch…
          </p>
        )}
      </form>

      {verifyResult && <VerifyBox result={verifyResult} />}
    </div>
  );
}

function VerifyBox({ result }: { result: VerifyResult }) {
  if (!result.ok) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs dark:border-red-900/40 dark:bg-red-900/10">
        <p className="flex items-center gap-1.5 font-medium text-red-700 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5" />
          Token-Test fehlgeschlagen
        </p>
        <p className="mt-1 text-red-700/80 dark:text-red-400/80">{result.error}</p>
      </div>
    );
  }

  const missing = result.missingRequiredScopes;
  const allGood = missing.length === 0;
  return (
    <div
      className={`rounded-md border p-3 text-xs ${
        allGood
          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-900/10"
          : "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/10"
      }`}
    >
      <p
        className={`flex items-center gap-1.5 font-medium ${
          allGood ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-300"
        }`}
      >
        {allGood ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
        {allGood ? "Token gültig" : "Token gültig — aber Scopes fehlen"}
      </p>
      <dl className="mt-2 grid gap-1 text-gray-700 dark:text-gray-300">
        <Row
          label="Besitzer"
          value={
            result.displayName
              ? `${result.displayName} (${result.personEmail ?? "?"})`
              : result.personEmail ?? "—"
          }
        />
        <Row
          label="Scopes"
          value={result.scopes.length > 0 ? result.scopes.join(", ") : "Keine Scopes lesbar"}
          mono
        />
        <Row label="Transkripte" value={result.hasTranscriptsScope ? "✓ aktiv" : "✗ Scope fehlt"} />
        <Row label="Click-to-Call" value={result.hasCallingScope ? "✓ aktiv" : "✗ Scope fehlt"} />
      </dl>
      {!allGood && (
        <p className="mt-2 rounded bg-red-100 p-2 text-red-800 dark:bg-red-900/40 dark:text-red-300">
          <strong>Pflicht-Scopes fehlen:</strong> {missing.join(", ")}. Neuen Token mit diesen
          Scopes erstellen.
        </p>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 font-medium">{label}:</dt>
      <dd className={mono ? "break-all font-mono text-[10.5px]" : ""}>{value}</dd>
    </div>
  );
}

function WhyBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-blue-50 p-3 text-xs text-blue-900 dark:bg-blue-900/20 dark:text-blue-300">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

function Hint({ children, tone }: { children: React.ReactNode; tone: "warn" | "info" }) {
  const cls =
    tone === "warn"
      ? "bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-300"
      : "bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:text-blue-300";
  return <div className={`mt-4 rounded-md p-3 text-xs ${cls}`}>{children}</div>;
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
      <span>{children}</span>
    </li>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] dark:border-[#2c2c2e] dark:bg-white/10">
      {children}
    </span>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-primary underline">
      {children}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

