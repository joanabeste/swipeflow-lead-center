import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { loadCreditor, loadProviderSignaturePath } from "@/lib/contracts/settings";
import { getContractFileSignedUrl } from "@/lib/contracts/pdf";
import { CreditorSettingsForm } from "../_components/creditor-settings-form";

export default async function VertraegeEinstellungenPage() {
  const creditor = await loadCreditor();
  const signaturePath = await loadProviderSignaturePath();
  const signatureUrl = signaturePath ? await getContractFileSignedUrl(signaturePath, 3600) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/vertraege"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
      >
        <ArrowLeft className="h-4 w-4" /> Zurück zu den Verträgen
      </Link>
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Einstellungen</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Eigene Bankdaten und Unterschrift für Verträge verwalten
        </p>
      </div>
      <CreditorSettingsForm initial={creditor} signatureUrl={signatureUrl} />
    </div>
  );
}
