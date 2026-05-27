"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { setLifecycleStage } from "../../../fulfillment/actions";
import { useToastContext } from "../../../toast-provider";

export function PromoteToCustomerButton({ leadId, alreadyCustomer }: { leadId: string; alreadyCustomer: boolean }) {
  const { addToast } = useToastContext();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (alreadyCustomer) {
    return (
      <button
        type="button"
        onClick={() => router.push(`/fulfillment/kunden/${leadId}`)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
      >
        <CheckCircle2 className="h-3.5 w-3.5" /> Im Fulfillment ansehen
      </button>
    );
  }

  function handleClick() {
    if (!confirm("Diesen Lead als Kunde markieren? Der Lead wandert ins Fulfillment-Modul (Daten bleiben erhalten).")) return;
    startTransition(async () => {
      try {
        const res = await setLifecycleStage(leadId, "customer");
        if ("error" in res) addToast(res.error, "error");
        else {
          addToast("Lead ist jetzt Kunde.", "success");
          router.push(`/fulfillment/kunden/${leadId}`);
        }
      } catch (e) {
        addToast(e instanceof Error ? e.message : "Konvertieren fehlgeschlagen.", "error");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-[#2c2c2e] dark:text-gray-300 dark:hover:bg-white/5"
    >
      <CheckCircle2 className="h-3.5 w-3.5" /> {pending ? "Wandele…" : "Als Kunde markieren"}
    </button>
  );
}
