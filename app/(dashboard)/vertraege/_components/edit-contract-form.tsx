"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateContractDraft } from "../actions";
import { parseEuroToCents } from "@/lib/contracts/format";
import { Button } from "@/components/ui/button";
import { ContractTermsFields, ContractAddressFields, type TermsState, type AddressState } from "./contract-terms-fields";

export function EditContractForm({
  id,
  initial,
  initialAddress,
}: {
  id: string;
  initial: TermsState;
  initialAddress: AddressState;
}) {
  const router = useRouter();
  const [terms, setTerms] = useState<TermsState>(initial);
  const [address, setAddress] = useState<AddressState>(initialAddress);
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
      billing: address,
    });
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    router.push(`/vertraege/${id}`);
  }

  return (
    <div className="space-y-6">
      <ContractTermsFields value={terms} onChange={setTerms} />

      <ContractAddressFields value={address} onChange={setAddress} />

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button onClick={() => router.push(`/vertraege/${id}`)} variant="secondary" size="md">
          Abbrechen
        </Button>
        <Button onClick={save} busy={busy} size="md">
          Speichern
        </Button>
      </div>
    </div>
  );
}
