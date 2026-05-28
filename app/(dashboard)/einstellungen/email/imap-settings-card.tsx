"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, AlertCircle, Zap, Trash2, Inbox } from "lucide-react";
import type { UserImapRecord } from "@/lib/email/user-credentials";
import {
  saveImapSettings,
  testImapSettings,
  deleteImapSettings,
  triggerManualSync,
} from "./imap-actions";
import { useToastContext } from "../../toast-provider";
import { FormStatus, SubmitButton } from "../_components/ui";
import { PasswordInput } from "@/components/password-input";

export function ImapSettingsCard({ imap, hasSmtp }: { imap: UserImapRecord | null; hasSmtp: boolean }) {
  const [state, formAction, pending] = useActionState(saveImapSettings, undefined);
  const [testState, testAction, testPending] = useActionState(testImapSettings, undefined);
  const [syncState, syncAction, syncPending] = useActionState(triggerManualSync, undefined);
  const [deletePending, startDelete] = useTransition();
  const { addToast } = useToastContext();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [showPasswordField, setShowPasswordField] = useState(!imap);

  async function handleTest() {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    await testAction(fd);
  }

  function handleDelete() {
    if (!confirm("IMAP-Zugangsdaten wirklich entfernen?")) return;
    startDelete(async () => {
      const res = await deleteImapSettings();
      if (res.error) addToast(res.error, "error");
      else {
        addToast("IMAP-Zugangsdaten entfernt.", "success");
        router.refresh();
      }
    });
  }

  if (!hasSmtp) {
    return (
      <p className="text-sm text-gray-500">
        Bitte zuerst die SMTP-Zugangsdaten oben einrichten.
      </p>
    );
  }

  return (
    <>
      {imap?.verifiedAt && (
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-md bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 dark:bg-green-900/20 dark:text-green-400">
          <Check className="h-3.5 w-3.5" />
          Verbunden seit {new Date(imap.verifiedAt).toLocaleString("de-DE")}
        </div>
      )}
      {imap?.lastSyncAt && (
        <p className="mb-2 text-xs text-gray-500">
          Letzter Sync: {new Date(imap.lastSyncAt).toLocaleString("de-DE")}
          {imap.lastSyncError && (
            <span className="ml-2 text-red-600">— Fehler: {imap.lastSyncError}</span>
          )}
        </p>
      )}

      <form action={formAction} ref={formRef} className="space-y-4">
        <FormStatus state={state} />
        <FormStatus state={testState} />
        <FormStatus state={syncState} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="imap_host" className="block text-sm font-medium">IMAP-Host</label>
            <input
              id="imap_host" name="imap_host" type="text" required
              defaultValue={imap?.host ?? "mail.agenturserver.de"}
              className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
            />
            <p className="mt-1 text-xs text-gray-500">Mittwald-Default: <span className="font-mono">mail.agenturserver.de</span></p>
          </div>

          <div>
            <label htmlFor="imap_port" className="block text-sm font-medium">Port</label>
            <input
              id="imap_port" name="imap_port" type="number" min={1} max={65535} required
              defaultValue={imap?.port ?? 993}
              className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
            />
            <p className="mt-1 text-xs text-gray-500">Standard 993 (SSL).</p>
          </div>

          <div>
            <label htmlFor="imap_username" className="block text-sm font-medium">Username</label>
            <input
              id="imap_username" name="imap_username" type="text" required
              defaultValue={imap?.username ?? ""}
              placeholder="pXXXXXXpX oder E-Mail"
              className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="imap_password" className="block text-sm font-medium">Passwort</label>
            {!showPasswordField && imap ? (
              <div className="mt-1.5 flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:border-[#2c2c2e] dark:bg-[#1c1c1e] dark:text-gray-400">
                <span>••••••••</span>
                <button type="button" onClick={() => setShowPasswordField(true)} className="text-xs font-medium text-primary hover:underline">
                  Ändern
                </button>
              </div>
            ) : (
              <PasswordInput
                id="imap_password" name="imap_password"
                required={!imap}
                placeholder={imap ? "Leer lassen = unverändert" : ""}
                className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
              />
            )}
            <p className="mt-1 text-xs text-gray-500">Wird verschlüsselt gespeichert.</p>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="imap_sent_folder" className="block text-sm font-medium">Sent-Ordner</label>
            <input
              id="imap_sent_folder" name="imap_sent_folder" type="text" required
              defaultValue={imap?.sentFolder ?? "Sent"}
              className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
            />
            <p className="mt-1 text-xs text-gray-500">
              Heißt je nach Provider &bdquo;Sent&ldquo;, &bdquo;Gesendet&ldquo; oder &bdquo;INBOX.Sent&ldquo;. Wird über &bdquo;Testen&ldquo; auf vorhandene Folder geprüft.
            </p>
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
          {imap && (
            <>
              <button
                type="button"
                onClick={() => syncAction(new FormData())}
                disabled={syncPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-200 dark:hover:bg-white/5"
              >
                <Inbox className="h-3.5 w-3.5" />
                {syncPending ? "Sync läuft…" : "Jetzt synchronisieren"}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deletePending}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deletePending ? "Entferne…" : "Zugangsdaten entfernen"}
              </button>
            </>
          )}
        </div>
      </form>
    </>
  );
}
