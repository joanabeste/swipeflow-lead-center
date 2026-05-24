"use client";

import { useTransition } from "react";
import { Check, X } from "lucide-react";
import { decideAbsence } from "../actions";
import { useToastContext } from "../../../../toast-provider";

export function DecisionButtons({ id }: { id: string }) {
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();

  function decide(status: "approved" | "rejected") {
    startTransition(async () => {
      const res = await decideAbsence(id, status);
      if ("error" in res) addToast(res.error, "error");
      else addToast(status === "approved" ? "Genehmigt." : "Abgelehnt.", "success");
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={() => decide("approved")} disabled={pending} className="inline-flex items-center gap-1 rounded-md bg-green-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-600 disabled:opacity-50">
        <Check className="h-3.5 w-3.5" /> Genehmigen
      </button>
      <button onClick={() => decide("rejected")} disabled={pending} className="inline-flex items-center gap-1 rounded-md bg-red-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50">
        <X className="h-3.5 w-3.5" /> Ablehnen
      </button>
    </div>
  );
}
