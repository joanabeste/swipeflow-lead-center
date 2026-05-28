import Link from "next/link";
import { FileSignature, Plus, Settings } from "lucide-react";
import { loadContracts } from "@/lib/contracts/data";
import { buttonClasses } from "@/components/ui/button";
import { ContractRow } from "./_components/contract-row";

export default async function VertraegeListePage() {
  const contracts = await loadContracts();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Verträge</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Kundenverträge erstellen, versenden und nachverfolgen
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/vertraege/einstellungen" className={buttonClasses("secondary", "sm")}>
            <Settings className="h-4 w-4" /> Einstellungen
          </Link>
          <Link href="/vertraege/neu" className={buttonClasses("primary", "sm")}>
            <Plus className="h-4 w-4" /> Neuer Vertrag
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
        {contracts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <FileSignature className="h-8 w-8 text-gray-300" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Noch keine Verträge angelegt.</p>
            <Link href="/vertraege/neu" className="text-sm font-medium text-primary hover:underline">
              Ersten Vertrag erstellen →
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wider text-gray-400 dark:border-[#2c2c2e]/40">
                <th className="px-4 py-3 font-medium">Kunde</th>
                <th className="px-4 py-3 font-medium">Herstellung</th>
                <th className="px-4 py-3 font-medium">Wartung/Mon.</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Gesendet</th>
                <th className="px-4 py-3 font-medium">Unterschrieben</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-[#2c2c2e]/40">
              {contracts.map((c) => (
                <ContractRow key={c.id} c={c} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
