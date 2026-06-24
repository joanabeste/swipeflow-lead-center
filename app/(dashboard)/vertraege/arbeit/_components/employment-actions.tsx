"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Mail, Copy, Check, Download, Trash2, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ContractStatus } from "@/lib/contracts/types";
import {
  createEmploymentLink,
  sendEmploymentContract,
  cancelEmploymentContract,
  deleteEmploymentContract,
  getEmploymentPdfUrl,
  getQuestionnairePdfUrl,
} from "../actions";

export function EmploymentActions({
  id,
  status,
  deletable,
  hasEmail,
  initialLink,
  questionnaireSubmitted,
}: {
  id: string;
  status: ContractStatus;
  deletable: boolean;
  hasEmail: boolean;
  initialLink: string | null;
  questionnaireSubmitted: boolean;
}) {
  const router = useRouter();
  const [link, setLink] = useState<string | null>(initialLink);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<{ error?: string } | unknown>) {
    setBusy(key);
    setError(null);
    const res = (await fn()) as { error?: string };
    setBusy(null);
    if (res && "error" in res && res.error) {
      setError(res.error);
      return null;
    }
    return res;
  }

  async function genLink() {
    const res = await run("link", () => createEmploymentLink(id));
    if (res && "link" in (res as Record<string, unknown>)) {
      setLink((res as { link: string }).link);
      router.refresh();
    }
  }

  async function send() {
    const res = await run("send", () => sendEmploymentContract(id));
    if (res) router.refresh();
  }

  async function downloadContract() {
    const res = await run("pdf", () => getEmploymentPdfUrl(id));
    if (res && "url" in (res as Record<string, unknown>)) window.open((res as { url: string }).url, "_blank");
  }

  async function downloadQuestionnaire() {
    const res = await run("qpdf", () => getQuestionnairePdfUrl(id));
    if (res && "url" in (res as Record<string, unknown>)) window.open((res as { url: string }).url, "_blank");
  }

  async function cancel() {
    if (!confirm("Diesen Arbeitsvertrag wirklich stornieren?")) return;
    const res = await run("cancel", () => cancelEmploymentContract(id));
    if (res) router.refresh();
  }

  async function remove() {
    if (!confirm("Diesen Arbeitsvertrag endgültig löschen?")) return;
    const res = await run("delete", () => deleteEmploymentContract(id));
    if (res) router.push("/vertraege/arbeit");
  }

  function copyLink() {
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const showLinkTools = status === "sent" || status === "viewed";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {status === "draft" && (
          <>
            <Button onClick={genLink} busy={busy === "link"} disabled={busy !== null} size="md">
              <Link2 className="h-4 w-4" /> Signier-Link erzeugen
            </Button>
            {hasEmail && (
              <Button variant="secondary" onClick={send} busy={busy === "send"} disabled={busy !== null} size="md">
                <Mail className="h-4 w-4" /> Per E-Mail senden
              </Button>
            )}
          </>
        )}

        {showLinkTools && hasEmail && (
          <Button variant="secondary" onClick={send} busy={busy === "send"} disabled={busy !== null} size="md">
            <Mail className="h-4 w-4" /> {status === "sent" || status === "viewed" ? "Erneut per E-Mail senden" : "Per E-Mail senden"}
          </Button>
        )}

        {status === "signed" && (
          <Button onClick={downloadContract} busy={busy === "pdf"} disabled={busy !== null} size="md">
            <Download className="h-4 w-4" /> Vertrag als PDF
          </Button>
        )}

        {status !== "cancelled" && status !== "signed" && (
          <Button variant="ghost" onClick={cancel} busy={busy === "cancel"} disabled={busy !== null} size="md">
            <Ban className="h-4 w-4" /> Stornieren
          </Button>
        )}
        {deletable && (
          <Button variant="danger" onClick={remove} busy={busy === "delete"} disabled={busy !== null} size="md">
            <Trash2 className="h-4 w-4" /> Löschen
          </Button>
        )}
      </div>

      {link && showLinkTools && (
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
          <Link2 className="h-4 w-4 shrink-0 text-gray-400" />
          <code className="min-w-0 flex-1 truncate text-xs text-gray-600 dark:text-gray-300">{link}</code>
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-white/10"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Kopiert" : "Kopieren"}
          </button>
        </div>
      )}

      {status === "signed" && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Personalfragebogen</p>
          {questionnaireSubmitted ? (
            <div className="mt-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">Vom Mitarbeiter ausgefüllt.</p>
              <Button onClick={downloadQuestionnaire} busy={busy === "qpdf"} disabled={busy !== null} size="sm" className="mt-2">
                <Download className="h-4 w-4" /> Personalfragebogen als PDF
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Wartet auf Ausfüllen durch den Mitarbeiter (direkt nach der Unterschrift über denselben Link).
            </p>
          )}
        </div>
      )}

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</p>}
    </div>
  );
}
