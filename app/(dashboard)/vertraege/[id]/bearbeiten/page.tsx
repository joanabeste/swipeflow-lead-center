import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { loadContract } from "@/lib/contracts/data";
import { isContractEditable } from "@/lib/contracts/types";
import { EditContractForm } from "../../_components/edit-contract-form";
import type { TermsState, AddressState } from "../../_components/contract-terms-fields";

export default async function VertragBearbeitenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadContract(id);
  if (!loaded) notFound();
  const { contract, lead } = loaded;
  if (!isContractEditable(contract)) redirect(`/vertraege/${id}`);

  const campaignDays =
    contract.campaign_start && contract.campaign_end
      ? Math.round(
          (new Date(`${contract.campaign_end}T00:00:00`).getTime() -
            new Date(`${contract.campaign_start}T00:00:00`).getTime()) /
            86_400_000,
        )
      : 30;

  const initial: TermsState = {
    setupEur: String(contract.setup_price_cents / 100),
    monthlyEur: String(contract.monthly_maint_cents / 100),
    paymentMode: contract.payment_mode,
    installments: String(contract.installment_count ?? 3),
    paymentMethod: contract.payment_method,
    jobTitle: contract.job_title ?? "",
    campaignStart: contract.campaign_start ?? "",
    campaignDays: String(campaignDays),
    campaignEnd: contract.campaign_end ?? "",
    adBudgetEur: String(contract.ad_budget_cents / 100),
    applicantGuarantee: contract.applicant_guarantee,
    contentPlatforms: contract.content_platforms ?? "",
    postsPerWeek: contract.posts_per_week != null ? String(contract.posts_per_week) : "",
    onsiteProduction: contract.onsite_production,
    onsiteIntervalMonths: contract.onsite_interval_months != null ? String(contract.onsite_interval_months) : "",
    minTermMonths: String(contract.min_term_months),
    noticeWeeks: String(contract.notice_period_weeks),
    withdrawalRight: contract.withdrawal_right,
  };

  const initialAddress: AddressState = {
    company: contract.billing_company ?? lead?.company_name ?? "",
    street: contract.billing_street ?? lead?.street ?? "",
    zip: contract.billing_zip ?? lead?.zip ?? "",
    city: contract.billing_city ?? lead?.city ?? "",
    email: contract.billing_email ?? lead?.email ?? "",
    country: contract.billing_country ?? "Deutschland",
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={`/vertraege/${id}`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">
        <ArrowLeft className="h-4 w-4" /> Zurück zum Vertrag
      </Link>
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Vertrag bearbeiten</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {isContractEditable(contract) && contract.status !== "draft"
            ? "Konditionen anpassen. Der bereits aktive Link zeigt die Änderungen sofort an."
            : "Konditionen des Entwurfs anpassen."}
        </p>
      </div>
      <EditContractForm id={id} type={contract.type} initial={initial} initialAddress={initialAddress} />
    </div>
  );
}
