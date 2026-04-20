"use client";

import { useTransition } from "react";
import { Sparkles } from "lucide-react";
import { backfillContactSalutations } from "./actions";
import { useToastContext } from "../toast-provider";

export function SalutationBackfillButton() {
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();

  function run() {
    if (!confirm(
      "Für alle Kontakte ohne Anrede wird versucht, das Geschlecht aus dem Vornamen zu erkennen. Fortfahren?",
    )) return;
    startTransition(async () => {
      const res = await backfillContactSalutations();
      if ("error" in res) {
        addToast(res.error, "error");
      } else {
        addToast(
          `${res.updated} von ${res.scanned} Kontakten ergänzt.`,
          "success",
        );
      }
    });
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-200 dark:hover:bg-white/5"
    >
      <Sparkles className="h-3.5 w-3.5" />
      {pending ? "Analysiere…" : "Anrede aus Vornamen nachtragen"}
    </button>
  );
}
