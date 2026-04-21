"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, AlertCircle, Zap, Trash2, Lock, Shield } from "lucide-react";
import type { UserSmtpRecord } from "@/lib/email/user-credentials";
import { saveEmailSettings, testEmailSettings, deleteEmailSettings } from "./actions";
import { useToastContext } from "../../toast-provider";
import { FormStatus, SubmitButton } from "../_components/ui";

type SecurityMode = "starttls" | "ssl";

export function EmailSettingsCard({ smtp }: { smtp: UserSmtpRecord | null }) {
  const [state, formAction, pending] = useActionState(saveEmailSettings, undefined);
  const [testState, testAction, testPending] = useActionState(testEmailSettings, undefined);
  const [deletePending, startDelete] = useTransition();
  const { addToast } = useToastContext();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [showPasswordField, setShowPasswordField] = useState(!smtp);

  // Security-Mode ersetzt das unklare "Implicit TLS"-Checkbox durch zwei
  // klar beschriftete Optionen. Bei Auswahl wird auch der Port auf den
  // passenden Default gesetzt (kann manuell überschrieben werden).
  const initialMode: SecurityMode = smtp?.secure ? "ssl" : "starttls";
  const [securityMode, setSecurityMode] = useState<SecurityMode>(initialMode);
  const [port, setPort] = useState<number>(smtp?.port ?? 587);

  function handleModeChange(mode: SecurityMode) {
    setSecurityMode(mode);
    // Port nur auf Default setzen, wenn aktueller Port dem jeweils anderen
    // Standard-Port entspricht. Wenn der User einen Nicht-Standard-Port
    // gewählt hat (z. B. 25), bleibt der bestehen.
    if (mode === "ssl" && (port === 587 || port === 25)) setPort(465);
    if (mode === "starttls" && port === 465) setPort(587);
  }

  async function handleTest() {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    await testAction(fd);
  }

  function handleDelete() {
    if (!confirm("SMTP-Zugangsdaten wirklich entfernen?")) return;
    startDelete(async () => {
      const res = await deleteEmailSettings();
      if (res.error) {
        addToast(res.error, "error");
      } else {
        addToast("SMTP-Zugangsdaten entfernt.", "success");
        router.refresh();
      }
    });
  }

  return (
    <>
      {smtp?.verifiedAt && !smtp.lastTestError && (
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-md bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 dark:bg-green-900/20 dark:text-green-400">
          <Check className="h-3.5 w-3.5" />
          Zuletzt erfolgreich verifiziert: {new Date(smtp.verifiedAt).toLocaleString("de-DE")}
        </div>
      )}
      {smtp?.lastTestError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
          <div className="flex items-center gap-1.5 font-medium">
            <AlertCircle className="h-4 w-4" />
            Letzter Verbindungstest fehlgeschlagen
          </div>
          <p className="mt-1 text-xs">{smtp.lastTestError}</p>
        </div>
      )}

      <form action={formAction} ref={formRef} className="space-y-4">
        <FormStatus state={state} />
        <FormStatus state={testState} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="host" className="block text-sm font-medium">SMTP-Host</label>
            <input
              id="host" name="host" type="text" required
              defaultValue={smtp?.host ?? "mail.agenturserver.de"}
              placeholder="z.B. mail.agenturserver.de"
              className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Mittwald-Default: <span className="font-mono">mail.agenturserver.de</span>
            </p>
          </div>

          {/* Security-Mode: zwei klare Optionen statt unklarer Checkbox. */}
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium">Verbindungs-Sicherheit</label>
            <input type="hidden" name="security_mode" value={securityMode} />
            <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <SecurityOption
                active={securityMode === "starttls"}
                onClick={() => handleModeChange("starttls")}
                icon={<Shield className="h-4 w-4" />}
                title="STARTTLS"
                subtitle="Port 587 · empfohlen"
                description="Startet unverschlüsselt und baut dann sofort eine TLS-Verschlüsselung auf. Standard für die meisten Provider (Mittwald, Gmail, etc.)."
              />
              <SecurityOption
                active={securityMode === "ssl"}
                onClick={() => handleModeChange("ssl")}
                icon={<Lock className="h-4 w-4" />}
                title="SSL/TLS"
                subtitle="Port 465"
                description="Komplette Verschlüsselung ab dem ersten Byte. Alternative für Provider, die STARTTLS nicht unterstützen."
              />
            </div>
          </div>

          <div>
            <label htmlFor="port" className="block text-sm font-medium">Port</label>
            <input
              id="port" name="port" type="number" min={1} max={65535} required
              value={port}
              onChange={(e) => setPort(Number(e.target.value) || 0)}
              className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Wird automatisch passend zur Sicherheit gesetzt — manuell überschreibbar.
            </p>
          </div>
          <div>
            <label htmlFor="username" className="block text-sm font-medium">Username</label>
            <input
              id="username" name="username" type="text" required
              defaultValue={smtp?.username ?? ""}
              placeholder="z. B. p123456p1 oder E-Mail-Adresse"
              className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Bei Mittwald die <strong>Postfach-Nummer</strong> im Format <span className="font-mono">pXXXXXXpX</span> (z. B. <span className="font-mono">p123456p1</span>) — alternativ die E-Mail-Adresse, falls ein Login-Alias gesetzt wurde.
            </p>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="password" className="block text-sm font-medium">Passwort</label>
            {!showPasswordField && smtp ? (
              <div className="mt-1.5 flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:border-[#2c2c2e] dark:bg-[#1c1c1e] dark:text-gray-400">
                <span>••••••••</span>
                <button
                  type="button"
                  onClick={() => setShowPasswordField(true)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Ändern
                </button>
              </div>
            ) : (
              <input
                id="password" name="password" type="password"
                required={!smtp}
                placeholder={smtp ? "Leer lassen = unverändert" : ""}
                className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
              />
            )}
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Bei Gmail: App-Passwort (2FA erforderlich). Wird verschlüsselt gespeichert.
            </p>
          </div>

          <div>
            <label htmlFor="from_name" className="block text-sm font-medium">Absender-Name</label>
            <input
              id="from_name" name="from_name" type="text" required
              defaultValue={smtp?.fromName ?? ""}
              placeholder="z.B. Max Mustermann"
              className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
            />
          </div>
          <div>
            <label htmlFor="from_email" className="block text-sm font-medium">Absender-Adresse</label>
            <input
              id="from_email" name="from_email" type="email" required
              defaultValue={smtp?.fromEmail ?? ""}
              placeholder="max@firma.de"
              className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button
            type="button"
            onClick={handleTest}
            disabled={testPending || pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-200 dark:hover:bg-white/5"
          >
            <Zap className="h-3.5 w-3.5" />
            {testPending ? "Teste…" : "Verbindung testen"}
          </button>
          <SubmitButton pending={pending}>Speichern</SubmitButton>
          {smtp && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deletePending}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deletePending ? "Entferne…" : "Zugangsdaten entfernen"}
            </button>
          )}
        </div>
      </form>
    </>
  );
}

function SecurityOption({
  active,
  onClick,
  icon,
  title,
  subtitle,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg border p-3 transition ${
        active
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-gray-200 bg-white hover:border-gray-300 dark:border-[#2c2c2e] dark:bg-[#232325] dark:hover:border-[#3a3a3c]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <span className={active ? "text-primary" : "text-gray-500 dark:text-gray-400"}>
            {icon}
          </span>
          {title}
        </div>
        {active && <Check className="h-4 w-4 text-primary" />}
      </div>
      <p className="mt-0.5 text-xs font-medium text-gray-500 dark:text-gray-400">{subtitle}</p>
      <p className="mt-1.5 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
        {description}
      </p>
    </button>
  );
}
