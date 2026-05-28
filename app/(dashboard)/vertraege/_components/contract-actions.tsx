"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Link2, Clock, Ban, Download, Loader2, Check } from "lucide-react";
import { sendContract, createContractLink, extendContract, cancelContract, getContractPdfUrl } from "../actions";
import type { ContractStatus } from "@/lib/contracts/types";

export function ContractActions({
  id,
  status,
  expired,
  link,
}: {
  id: string;
  status: ContractStatus;
  expired: boolean;
  link: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function run(key: string, fn: () => Promise<{ success: true } | { error: string } | { success: true; url: string }>) {
    setError(null);
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    if ("url" in res && res.url) {
      window.open(res.url, "_blank");
      return;
    }
    router.refresh();
  }

  function copyLink() {
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Erzeugt den Signier-Link ohne E-Mail-Versand und kopiert ihn (best-effort —
  // manche Browser blocken Clipboard nach await; danach erscheint der reguläre
  // "Link kopieren"-Button für einen zuverlässigen, synchronen Copy).
  async function createAndCopyLink() {
    setError(null);
    setBusy("createLink");
    const res = await createContractLink(id);
    setBusy(null);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    try {
      await navigator.clipboard.writeText(res.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard nach await blockiert — ignorieren, Link ist nach refresh sichtbar.
    }
    router.refresh();
  }

  const canSend = status !== "signed" && status !== "cancelled";
  const isResend = (status === "sent" || status === "viewed") && !!link;
  const canExtend = expired && (status === "sent" || status === "viewed");
  const canCancel = status !== "signed" && status !== "cancelled";
  const canDownload = status === "signed";

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {canSend && (
          <Btn onClick={() => run("send", () => sendContract(id))} busy={busy === "send"} primary>
            <Send className="h-4 w-4" /> {isResend ? "Erneut senden" : "Senden"}
          </Btn>
        )}
        {canSend && !link && (
          <Btn onClick={createAndCopyLink} busy={busy === "createLink"}>
            <Link2 className="h-4 w-4" /> Link erstellen & kopieren
          </Btn>
        )}
        {link && (
          <Btn onClick={copyLink}>
            {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />} {copied ? "Kopiert" : "Link kopieren"}
          </Btn>
        )}
        {canExtend && (
          <Btn onClick={() => run("extend", () => extendContract(id))} busy={busy === "extend"}>
            <Clock className="h-4 w-4" /> Verlängern
          </Btn>
        )}
        {canDownload && (
          <Btn onClick={() => run("pdf", () => getContractPdfUrl(id))} busy={busy === "pdf"}>
            <Download className="h-4 w-4" /> PDF
          </Btn>
        )}
        {canCancel && (
          <Btn onClick={() => run("cancel", () => cancelContract(id))} busy={busy === "cancel"} danger>
            <Ban className="h-4 w-4" /> Stornieren
          </Btn>
        )}
      </div>
      {error && <p className="max-w-xs text-right text-xs text-red-500">{error}</p>}
    </div>
  );
}

function Btn({
  onClick,
  busy,
  primary,
  danger,
  children,
}: {
  onClick: () => void;
  busy?: boolean;
  primary?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const base = primary
    ? "bg-primary text-gray-900 hover:bg-primary/90"
    : danger
      ? "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300"
      : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-200 dark:hover:bg-white/15";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition disabled:opacity-50 ${base}`}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  );
}
