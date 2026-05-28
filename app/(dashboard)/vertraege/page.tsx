import Link from "next/link";
import { FileSignature, Plus, Settings } from "lucide-react";
import { loadContracts } from "@/lib/contracts/data";
import { formatEuro } from "@/lib/contracts/format";
import { buttonClasses } from "@/components/ui/button";
import { ContractRow } from "./_components/contract-row";

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

const TABS = [
  { key: "alle", label: "Alle Verträge", href: "/vertraege" },
  { key: "wiederkehrend", label: "Wiederkehrend", href: "/vertraege?tab=wiederkehrend" },
] as const;

export default async function VertraegeListePage({ searchParams }: Props) {
  const params = await searchParams;
  const recurring = params.tab === "wiederkehrend";
  const activeKey = recurring ? "wiederkehrend" : "alle";

  const contracts = await loadContracts({ recurringOnly: recurring });
  const monthlySum = contracts.reduce((sum, c) => sum + c.monthly_maint_cents, 0);

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

      <div className="flex gap-1 border-b border-gray-200 dark:border-[#2c2c2e]/50">
        {TABS.map((t) => {
          const active = t.key === activeKey;
          return (
            <Link
              key={t.key}
              href={t.href}
              className={
                active
                  ? "border-b-2 border-primary px-4 py-2 text-sm font-medium text-gray-900 dark:text-white"
                  : "border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {recurring && contracts.length > 0 && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
          Laufende Hosting-/Wartungseinnahmen:{" "}
          <span className="font-semibold text-gray-900 dark:text-white">{formatEuro(monthlySum)} netto / Monat</span>
          <span className="text-gray-500 dark:text-gray-400"> · {formatEuro(monthlySum * 12)} netto / Jahr</span>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
        {contracts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <FileSignature className="h-8 w-8 text-gray-300" />
            {recurring ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Noch keine unterschriebenen Verträge mit Hosting/Wartung.
              </p>
            ) : (
              <>
                <p className="text-sm text-gray-500 dark:text-gray-400">Noch keine Verträge angelegt.</p>
                <Link href="/vertraege/neu" className="text-sm font-medium text-primary hover:underline">
                  Ersten Vertrag erstellen →
                </Link>
              </>
            )}
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
