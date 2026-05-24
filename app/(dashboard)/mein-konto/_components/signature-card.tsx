"use client";

import { useState, useTransition } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { extractMySignatureAction, saveSignatureAction } from "../../fulfillment/mail-actions";
import { useToastContext } from "../../toast-provider";

export function SignatureCard({ initial }: { initial: string | null }) {
  const { addToast } = useToastContext();
  const [text, setText] = useState(initial ?? "");
  const [extractPending, startExtract] = useTransition();
  const [savePending, startSave] = useTransition();

  function handleExtract() {
    startExtract(async () => {
      const res = await extractMySignatureAction();
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      if (res.signature) {
        setText(res.signature);
        addToast("Signatur erkannt und übernommen.", "success");
      } else {
        addToast("Keine wiederkehrende Signatur gefunden.", "error");
      }
    });
  }

  function handleSave() {
    startSave(async () => {
      const res = await saveSignatureAction(text);
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      addToast("Signatur gespeichert.", "success");
    });
  }

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder="Deine E-Mail-Signatur — wird an jede aus dem Tool gesendete Mail angehängt."
        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e] dark:text-gray-100"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleExtract}
          disabled={extractPending}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-[#2c2c2e]/60 dark:hover:bg-white/5"
        >
          {extractPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-primary" />}
          {extractPending ? "Analysiere…" : "Aus eigenen Mails extrahieren"}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={savePending}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-primary-dark disabled:opacity-50"
        >
          {savePending ? "Speichern…" : "Speichern"}
        </button>
        <span className="ml-auto text-[11px] text-gray-400">
          Wird automatisch an jede aus dem Tool gesendete Mail angehängt.
        </span>
      </div>
    </div>
  );
}
