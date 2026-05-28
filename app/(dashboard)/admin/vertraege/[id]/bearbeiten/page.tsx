import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { loadContract } from "@/lib/contracts/data";
import { EditContractForm } from "../../_components/edit-contract-form";
import type { TermsState } from "../../_components/contract-terms-fields";

export default async function VertragBearbeitenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadContract(id);
  if (!loaded) notFound();
  const { contract } = loaded;
  if (contract.status !== "draft") redirect(`/admin/vertraege/${id}`);

  const initial: TermsState = {
    setupEur: String(contract.setup_price_cents / 100),
    monthlyEur: String(contract.monthly_maint_cents / 100),
    paymentMode: contract.payment_mode,
    installments: String(contract.installment_count ?? 3),
    paymentMethod: contract.payment_method,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={`/admin/vertraege/${id}`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">
        <ArrowLeft className="h-4 w-4" /> Zurück zum Vertrag
      </Link>
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Vertrag bearbeiten</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Konditionen des Entwurfs anpassen.</p>
      </div>
      <EditContractForm id={id} initial={initial} />
    </div>
  );
}
