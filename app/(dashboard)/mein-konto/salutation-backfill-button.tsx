"use client";

import { useTransition } from "react";
import { Sparkles, Eye } from "lucide-react";
import { backfillContactSalutations } from "./actions";
import { useToastContext } from "../toast-provider";

export function SalutationBackfillButton() {
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();

  function format(res: Exclude<Awaited<ReturnType<typeof backfillContactSalutations>>, { error: string }>) {
    const count = res.dryRun ? res.wouldUpdate ?? 0 : res.updated;
    const verb = res.dryRun ? "würden ergänzt" : "ergänzt";
    return `${count} von ${res.scanned} Kontakten ${verb} — Quelle: ${res.bySource.name} Name / ${res.bySource.email} E-Mail · Anrede: ${res.byGender.herr}× Herr / ${res.byGender.frau}× Frau`;
  }

  function run(dryRun: boolean) {
    if (!dryRun && !confirm(
      "Für alle Kontakte ohne Anrede wird versucht, das Geschlecht aus dem Vornamen oder der E-Mail zu erkennen. Fortfahren?",
    )) return;
    startTransition(async () => {
      const res = await backfillContactSalutations({ dryRun });
      if ("error" in res) {
        addToast(res.error, "error");
      } else {
        addToast(format(res), "success");
      }
    });
  }

  return (
    <div className="inline-flex gap-2">
      <button
        type="button"
        onClick={() => run(true)}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-200 dark:hover:bg-white/5"
        title="Zeigt, wie viele Kontakte ergänzt würden, ohne etwas zu schreiben."
      >
        <Eye className="h-3.5 w-3.5" />
        {pending ? "Prüfe…" : "Vorschau"}
      </button>
      <button
        type="button"
        onClick={() => run(false)}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-200 dark:hover:bg-white/5"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {pending ? "Analysiere…" : "Anrede nachtragen"}
      </button>
    </div>
  );
}
