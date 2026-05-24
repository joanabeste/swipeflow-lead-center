"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import {
  backfillSignaturesForExistingMails,
  rematchUnassignedThreads,
} from "../../mail-actions";
import { useToastContext } from "../../../toast-provider";

export function InboxAdminActions() {
  const { addToast } = useToastContext();
  const router = useRouter();
  const [pendingRematch, startRematch] = useTransition();
  const [pendingSignatures, startSignatures] = useTransition();

  function onRematch() {
    startRematch(async () => {
      const res = await rematchUnassignedThreads();
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      addToast(
        res.matched > 0
          ? `${res.matched} von ${res.scanned} Threads neu zugeordnet.`
          : `Keine neuen Zuordnungen (${res.scanned} geprüft).`,
        res.matched > 0 ? "success" : "info",
      );
      router.refresh();
    });
  }

  function onBackfillSignatures() {
    if (!confirm("Signaturen aus den letzten ~100 eingehenden Mails per Claude analysieren und neue Kontakte anlegen? Kostet ~0,10 €.")) {
      return;
    }
    startSignatures(async () => {
      const res = await backfillSignaturesForExistingMails(100);
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      addToast(
        res.created > 0
          ? `${res.created} Kontakte aus Signaturen angelegt (${res.scanned} Mails geprüft).`
          : `Keine neuen Kontakte gefunden (${res.scanned} Mails geprüft).`,
        res.created > 0 ? "success" : "info",
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onRematch}
        disabled={pendingRematch}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-[#2c2c2e]/60 dark:bg-[#161618] dark:text-gray-200 dark:hover:bg-white/5"
      >
        {pendingRematch ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
        Unzugeordnete neu auswerten
      </button>
      <button
        type="button"
        onClick={onBackfillSignatures}
        disabled={pendingSignatures}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-[#2c2c2e]/60 dark:bg-[#161618] dark:text-gray-200 dark:hover:bg-white/5"
      >
        {pendingSignatures ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        Signaturen rückwirkend scannen
      </button>
    </div>
  );
}
