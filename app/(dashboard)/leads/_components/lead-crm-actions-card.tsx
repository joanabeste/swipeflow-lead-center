"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Send, Sparkles, Loader2 } from "lucide-react";
import type { LeadStatus } from "@/lib/types";
import { DEFAULT_QUALIFY_STATUS_BY_MODE } from "@/lib/service-mode-constants";
import { useServiceMode } from "@/lib/service-mode";
import { usePreviewRefresh } from "@/lib/preview-refresh-context";
import { useToastContext } from "../../toast-provider";
import { bulkUpdateStatus } from "../actions";
import { enrichAndMoveToCrm } from "../enrichment-actions";

interface Props {
  leadId: string;
  status: LeadStatus;
  /** Primäres "ist im CRM"-Signal — gesetzt = Lead liegt im CRM-Workflow. */
  crmStatusId: string | null;
}

/**
 * Rechte-Spalten-Karte für die Neue-Leads-Seitenansicht: übernimmt einen
 * einzelnen Lead in den CRM-Workflow — direkt oder erst nach Anreicherung.
 * Sobald der Lead im CRM liegt (crm_status_id gesetzt oder status qualified/
 * exported), zeigt die Karte nur noch einen Hinweis statt der Buttons.
 */
export function LeadCrmActionsCard({ leadId, status, crmStatusId }: Props) {
  const { mode } = useServiceMode();
  const { addToast } = useToastContext();
  const refresh = usePreviewRefresh();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"crm" | "enrich" | null>(null);

  const alreadyInCrm = crmStatusId != null || status === "qualified" || status === "exported";

  function moveToCrm() {
    if (pending) return;
    setBusy("crm");
    startTransition(async () => {
      const res = await bulkUpdateStatus([leadId], "qualified", DEFAULT_QUALIFY_STATUS_BY_MODE[mode]);
      setBusy(null);
      if ("error" in res && res.error) {
        addToast(`Fehler: ${res.error}`, "error");
        return;
      }
      addToast("Lead ins CRM verschoben", "success", { action: { label: "Zum CRM", href: "/crm" } });
      refresh();
    });
  }

  function enrichAndMove() {
    if (pending) return;
    setBusy("enrich");
    startTransition(async () => {
      // config undefined → DEFAULT_ENRICHMENT_CONFIG (ohne Ampel, schneller).
      const res = await enrichAndMoveToCrm(leadId, undefined, mode);
      setBusy(null);
      if ("error" in res) {
        addToast(`Fehler: ${res.error}`, "error");
        return;
      }
      addToast("Lead angereichert & ins CRM verschoben", "success", {
        action: { label: "Zum CRM", href: "/crm" },
      });
      refresh();
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <Send className="h-4 w-4 text-primary" />
        CRM
      </h3>

      {alreadyInCrm ? (
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Bereits im CRM.{" "}
          <Link href={`/crm/${leadId}`} className="text-primary hover:underline">
            Im CRM öffnen
          </Link>
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {/* Primäre Aktion: anreichern, danach automatisch ins CRM. */}
          <button
            onClick={enrichAndMove}
            disabled={pending}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-gray-900 transition hover:bg-primary-dark disabled:opacity-50"
          >
            {busy === "enrich" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {busy === "enrich" ? "Wird angereichert…" : "Anreichern + ins CRM"}
          </button>

          {/* Sekundäre Aktion: sofort ins CRM (ohne Anreicherung). */}
          <button
            onClick={moveToCrm}
            disabled={pending}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {busy === "crm" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Ins CRM
          </button>
        </div>
      )}
    </div>
  );
}
