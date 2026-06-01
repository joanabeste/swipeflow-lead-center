"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X, Copy, Mail, RefreshCw, Power, Check, Loader2 } from "lucide-react";
import { useToastContext } from "../../../../toast-provider";
import {
  ensureShareLink,
  disableShareLink,
  rotateShareToken,
  sendShareLinkEmailAction,
} from "../../actions";

export function ShareLinkDialog({
  leadId,
  customerName,
  open,
  initialActive,
  onClose,
}: {
  leadId: string;
  customerName: string;
  open: boolean;
  initialActive: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [mounted, setMounted] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [copied, setCopied] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Bei aktivem Link automatisch laden/anzeigen.
  useEffect(() => {
    if (!open || !initialActive || url) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    ensureShareLink(leadId)
      .then((res) => {
        if ("url" in res) setUrl(res.url);
        else addToast(res.error, "error");
      })
      .finally(() => setLoading(false));
  }, [open, initialActive, url, leadId, addToast]);

  function createLink() {
    setLoading(true);
    startTransition(async () => {
      const res = await ensureShareLink(leadId);
      setLoading(false);
      if ("url" in res) {
        setUrl(res.url);
        router.refresh();
      } else {
        addToast(res.error, "error");
      }
    });
  }

  function copy() {
    if (!url) return;
    navigator.clipboard.writeText(url).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => addToast("Kopieren fehlgeschlagen.", "error"),
    );
  }

  function sendEmail() {
    if (!emailTo.trim()) return;
    startTransition(async () => {
      const res = await sendShareLinkEmailAction(leadId, emailTo);
      if ("error" in res) addToast(res.error, "error");
      else {
        addToast("Freigabelink per E-Mail gesendet.", "success");
        setEmailTo("");
        router.refresh();
      }
    });
  }

  function rotate() {
    startTransition(async () => {
      const res = await rotateShareToken(leadId);
      if ("url" in res) {
        setUrl(res.url);
        addToast("Neuer Link erzeugt — der alte ist nicht mehr gültig.", "success");
        router.refresh();
      } else {
        addToast(res.error, "error");
      }
    });
  }

  function disable() {
    startTransition(async () => {
      const res = await disableShareLink(leadId);
      if ("error" in res) addToast(res.error, "error");
      else {
        setUrl(null);
        addToast("Freigabelink deaktiviert.", "success");
        router.refresh();
        onClose();
      }
    });
  }

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-[#1c1c1e]">
        <header className="flex items-start justify-between gap-3 border-b border-gray-100 px-6 py-4 dark:border-[#2c2c2e]/50">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Freigabelink</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">{customerName}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 px-6 py-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Ein dauerhafter Link, über den der Kunde alle Beiträge mit Status „In Freigabe&quot; ansehen, kommentieren und
            einzeln freigeben kann.
          </p>

          {!url ? (
            <button
              type="button"
              onClick={createLink}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-gray-900 transition hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Freigabelink erstellen
            </button>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-[#2c2c2e] dark:bg-[#161618] dark:text-gray-200"
                />
                <button
                  type="button"
                  onClick={copy}
                  title="Kopieren"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-[#2c2c2e] dark:text-gray-300 dark:hover:bg-white/5"
                >
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    placeholder="E-Mail des Kunden"
                    className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-[#2c2c2e] dark:bg-[#161618] dark:text-gray-100"
                  />
                </div>
                <button
                  type="button"
                  onClick={sendEmail}
                  disabled={!emailTo.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-gray-900 transition hover:bg-primary/90 disabled:opacity-50"
                >
                  Senden
                </button>
              </div>

              <div className="flex items-center gap-3 border-t border-gray-100 pt-3 text-xs dark:border-[#2c2c2e]/50">
                <button type="button" onClick={rotate} className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                  <RefreshCw className="h-3.5 w-3.5" /> Neu generieren
                </button>
                <button type="button" onClick={disable} className="inline-flex items-center gap-1.5 text-red-500 hover:text-red-600">
                  <Power className="h-3.5 w-3.5" /> Deaktivieren
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
