"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { updateContractDraft } from "../actions";
import { parseEuroToCents } from "@/lib/contracts/format";
import { ContractTermsFields, type TermsState } from "./contract-terms-fields";

export function EditContractForm({ id, initial }: { id: string; initial: TermsState }) {
  const router = useRouter();
  const [terms, setTerms] = useState<TermsState>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setBusy(true);
    const res = await updateContractDraft(id, {
      setup_price_cents: parseEuroToCents(terms.setupEur),
      monthly_maint_cents: parseEuroToCents(terms.monthlyEur),
      payment_mode: terms.paymentMode,
      installment_count: terms.paymentMode === "raten" ? Number(terms.installments) : null,
      payment_method: terms.paymentMethod,
    });
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    router.push(`/admin/vertraege/${id}`);
  }

  return (
    <div className="space-y-6">
      <ContractTermsFields value={terms} onChange={setTerms} />

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          onClick={() => router.push(`/admin/vertraege/${id}`)}
          className="rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-200 dark:bg-white/10 dark:text-gray-200 dark:hover:bg-white/15"
        >
          Abbrechen
        </button>
        <button
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Speichern
        </button>
      </div>
    </div>
  );
}
