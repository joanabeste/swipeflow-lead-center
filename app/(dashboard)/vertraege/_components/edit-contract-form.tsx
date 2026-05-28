"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateContractDraft } from "../actions";
import { parseEuroToCents } from "@/lib/contracts/format";
import { Button } from "@/components/ui/button";
import type { ContractType } from "@/lib/contracts/types";
import { ContractTermsFields, ContractAddressFields, type TermsState, type AddressState } from "./contract-terms-fields";

export function EditContractForm({
  id,
  type,
  initial,
  initialAddress,
}: {
  id: string;
  type: ContractType;
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
      ad_budget_cents: parseEuroToCents(terms.adBudgetEur),
      job_title: terms.jobTitle,
      campaign_start: terms.campaignStart || null,
      campaign_end: terms.campaignEnd || null,
      applicant_guarantee: terms.applicantGuarantee,
      content_platforms: terms.contentPlatforms || null,
      posts_per_week: terms.postsPerWeek ? Number(terms.postsPerWeek) : null,
      onsite_production: terms.onsiteProduction,
      onsite_interval_months: terms.onsiteIntervalMonths ? Number(terms.onsiteIntervalMonths) : null,
      min_term_months: terms.minTermMonths ? Number(terms.minTermMonths) : 0,
      notice_period_weeks: terms.noticeWeeks ? Number(terms.noticeWeeks) : 4,
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
      <ContractTermsFields value={terms} onChange={setTerms} type={type} />

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
