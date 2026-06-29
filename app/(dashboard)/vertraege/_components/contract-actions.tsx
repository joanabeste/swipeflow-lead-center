"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Send, Link2, Clock, Ban, Download, Check, Trash2, ExternalLink, Eye, Pencil, Printer } from "lucide-react";
import { sendContract, createContractLink, extendContract, cancelContract, deleteContract, getContractPdfUrl, getUnsignedContractPdfUrl } from "../actions";
import { Button, buttonClasses } from "@/components/ui/button";
import type { ContractStatus } from "@/lib/contracts/types";
import { useToastContext } from "../../toast-provider";

/** Macht aus einem evtl. relativen Link (fehlendes APP_BASE_URL) eine absolute URL. */
function toAbsolute(l: string): string {
  if (/^https?:\/\//i.test(l)) return l;
  return `${window.location.origin}${l.startsWith("/") ? "" : "/"}${l}`;
}

export function ContractActions({
  id,
  status,
  expired,
  link,
  linkActive,
  editable,
}: {
  id: string;
  status: ContractStatus;
  expired: boolean;
  link: string | null;
  linkActive: boolean;
  /** Vertrag bearbeitbar → blendet den „Bearbeiten"-Link in die Leiste ein. */
  editable: boolean;
}) {
  const router = useRouter();
  const { addToast } = useToastContext();
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

  // Lädt eine signed-URL und öffnet sie in einem neuen Tab. Das Tab wird SYNCHRON
  // beim Klick geöffnet (sonst blockt der Popup-Blocker den verzögerten window.open
  // nach dem await — z. B. wenn das PDF erst gerendert werden muss).
  async function openInNewTab(key: string, fn: () => Promise<{ url: string } | { error: string } | { success: true }>) {
    setError(null);
    setBusy(key);
    const win = window.open("", "_blank");
    const res = await fn();
    setBusy(null);
    if ("error" in res) {
      win?.close();
      setError(res.error);
      return;
    }
    if ("url" in res && res.url && win) {
      win.location.href = res.url;
    } else if ("url" in res && res.url) {
      // Tab wurde blockiert → wenigstens im aktuellen Tab öffnen.
      window.open(res.url, "_blank");
    }
  }

  function openLink() {
    if (!link) return;
    window.open(toAbsolute(link), "_blank");
  }

  function copyLink() {
    if (!link) return;
    navigator.clipboard.writeText(toAbsolute(link)).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        addToast("Vertragslink in die Zwischenablage kopiert", "success");
      },
      () => addToast("Link konnte nicht kopiert werden", "error"),
    );
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
      await navigator.clipboard.writeText(toAbsolute(res.link));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      addToast("Vertragslink in die Zwischenablage kopiert", "success");
    } catch {
      // Clipboard nach await blockiert — Link ist nach refresh über "Link kopieren" erreichbar.
      addToast("Link erstellt — bitte über 'Link kopieren' kopieren", "info");
    }
    router.refresh();
  }

  async function cancel() {
    if (
      status === "signed" &&
      !window.confirm(
        "Diesen bereits unterschriebenen Vertrag wirklich stornieren? Der Vertrag gilt damit als aufgehoben.",
      )
    ) {
      return;
    }
    run("cancel", () => cancelContract(id));
  }

  async function remove() {
    const msg = linkActive
      ? "Diesen Vertrag endgültig löschen? Der aktive Link wird damit ungültig. Das kann nicht rückgängig gemacht werden."
      : "Diesen Vertrag endgültig löschen? Das kann nicht rückgängig gemacht werden.";
    if (!window.confirm(msg)) return;
    setError(null);
    setBusy("delete");
    const res = await deleteContract(id);
    if ("error" in res) {
      setBusy(null);
      setError(res.error);
      return;
    }
    router.push("/vertraege");
  }

  const canSend = status !== "signed" && status !== "cancelled";
  const isResend = (status === "sent" || status === "viewed") && !!link;
  const canExtend = expired && (status === "sent" || status === "viewed");
  const canCancel = status !== "cancelled";
  const canDownload = status === "signed";
  // Unsignierte Druckfassung zum Ausdrucken & Unterschreiben auf Papier.
  const canPrint = status !== "signed" && status !== "cancelled";
  const canDelete = status === "draft" || status === "cancelled" || linkActive;

  return (
    <div>
      {/* Eine zusammenhängende Aktionsleiste: Primäraktion → Link/Dokument-Aktionen
          → Trenner → destruktive Aktionen. Linksbündig, damit die Hierarchie klar
          lesbar ist und destruktive Aktionen räumlich abgesetzt sind. */}
      <div className="flex flex-wrap items-center gap-2">
        {canSend && (
          <Button onClick={() => run("send", () => sendContract(id))} busy={busy === "send"} variant="primary">
            <Send className="h-4 w-4" /> {isResend ? "Erneut senden" : "Senden"}
          </Button>
        )}
        {link && (
          <Button onClick={openLink} variant="secondary">
            <ExternalLink className="h-4 w-4" /> Zum Unterzeichnen öffnen
          </Button>
        )}
        {canSend && !link && (
          <Button onClick={createAndCopyLink} busy={busy === "createLink"} variant="secondary">
            <Link2 className="h-4 w-4" /> Link erstellen & kopieren
          </Button>
        )}
        {link && (
          <Button onClick={copyLink} variant="secondary">
            {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />} {copied ? "Kopiert" : "Link kopieren"}
          </Button>
        )}
        {canExtend && (
          <Button onClick={() => run("extend", () => extendContract(id))} busy={busy === "extend"} variant="secondary">
            <Clock className="h-4 w-4" /> Verlängern
          </Button>
        )}

        <Link href={`/vertraege/${id}/vorschau`} className={buttonClasses("secondary", "sm")}>
          <Eye className="h-4 w-4" /> Vorschau
        </Link>
        {editable && (
          <Link href={`/vertraege/${id}/bearbeiten`} className={buttonClasses("secondary", "sm")}>
            <Pencil className="h-4 w-4" /> Bearbeiten
          </Link>
        )}
        {canDownload && (
          <Button onClick={() => openInNewTab("pdf", () => getContractPdfUrl(id))} busy={busy === "pdf"} variant="secondary">
            <Download className="h-4 w-4" /> PDF
          </Button>
        )}
        {canPrint && (
          <Button onClick={() => openInNewTab("print", () => getUnsignedContractPdfUrl(id))} busy={busy === "print"} variant="secondary">
            <Printer className="h-4 w-4" /> PDF zum Ausdrucken
          </Button>
        )}

        {(canCancel || canDelete) && (
          <span className="mx-1 h-6 w-px self-center bg-gray-200 dark:bg-white/10" aria-hidden />
        )}
        {canCancel && (
          <Button onClick={cancel} busy={busy === "cancel"} variant="danger">
            <Ban className="h-4 w-4" /> Stornieren
          </Button>
        )}
        {canDelete && (
          <Button onClick={remove} busy={busy === "delete"} variant="danger">
            <Trash2 className="h-4 w-4" /> Löschen
          </Button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
