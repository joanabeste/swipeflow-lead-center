import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { loadCustomersForPicker } from "@/lib/contracts/data";
import { NewContractForm } from "../_components/new-contract-form";

export default async function NeuerVertragPage() {
  const customers = await loadCustomersForPicker();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/admin/vertraege" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">
        <ArrowLeft className="h-4 w-4" /> Zurück zur Übersicht
      </Link>
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Neuer Vertrag</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Webdesign-Vertrag konfigurieren. Den Link versendest du anschließend auf der Detailseite.
        </p>
      </div>
      <NewContractForm customers={customers} />
    </div>
  );
}
