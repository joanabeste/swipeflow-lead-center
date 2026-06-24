import Link from "next/link";
import { Briefcase, Plus } from "lucide-react";
import { loadEmploymentContracts, loadQuestionnaire } from "@/lib/employment/data";
import { formatEuro } from "@/lib/contracts/format";
import { buttonClasses } from "@/components/ui/button";
import { isExpired, isLinkActive } from "@/lib/contracts/types";
import { employeeName, VARIANT_LABELS } from "@/lib/employment/types";
import { StatusBadge } from "../_components/status-badge";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-DE");
}

export default async function ArbeitsvertraegeListePage() {
  const contracts = await loadEmploymentContracts();
  const questionnaires = await Promise.all(
    contracts.map((c) => (c.status === "signed" ? loadQuestionnaire(c.id) : Promise.resolve(null))),
  );
  const qStatusById = new Map(contracts.map((c, i) => [c.id, questionnaires[i]?.status ?? null]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Arbeitsverträge</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Arbeitsverträge für eigene Mitarbeiter erstellen, signieren lassen und den Personalfragebogen erfassen
          </p>
        </div>
        <Link href="/vertraege/arbeit/neu" className={buttonClasses("primary", "sm")}>
          <Plus className="h-4 w-4" /> Neuer Arbeitsvertrag
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
        {contracts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <Briefcase className="h-8 w-8 text-gray-300" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Noch keine Arbeitsverträge angelegt.</p>
            <Link href="/vertraege/arbeit/neu" className="text-sm font-medium text-primary hover:underline">
              Ersten Arbeitsvertrag erstellen →
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wider text-gray-400 dark:border-[#2c2c2e]/40">
                <th className="px-4 py-3 font-medium">Mitarbeiter</th>
                <th className="px-4 py-3 font-medium">Variante</th>
                <th className="px-4 py-3 font-medium">Vergütung</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Fragebogen</th>
                <th className="px-4 py-3 font-medium">Unterschrieben</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-[#2c2c2e]/40">
              {contracts.map((c) => {
                const qStatus = qStatusById.get(c.id);
                const verguetung =
                  c.pay_model === "hourly"
                    ? `${formatEuro(c.hourly_wage_cents)} / Std.`
                    : `${formatEuro(c.monthly_salary_cents)} / Monat`;
                return (
                  <tr key={c.id} className="transition hover:bg-gray-50 dark:hover:bg-white/5">
                    <td className="px-4 py-3">
                      <Link href={`/vertraege/arbeit/${c.id}`} className="font-medium text-gray-900 hover:text-primary dark:text-white">
                        {employeeName(c) || "Unbenannt"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{VARIANT_LABELS[c.variant]}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{verguetung}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} expired={isExpired(c)} emailed={!isLinkActive(c)} />
                    </td>
                    <td className="px-4 py-3">
                      {c.status !== "signed" ? (
                        <span className="text-xs text-gray-400">—</span>
                      ) : qStatus === "submitted" ? (
                        <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-300">
                          Ausgefüllt
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                          Offen
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{formatDate(c.signed_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
