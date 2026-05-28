import { Copy, Phone } from "lucide-react";
import { findDuplicateClusters } from "./actions";
import { MergeAllButton } from "./merge-button";

export const dynamic = "force-dynamic";

export default async function DuplikatePage() {
  const clusters = await findDuplicateClusters();
  const totalDuplicates = clusters.reduce((sum, c) => sum + c.losers.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Duplikate bereinigen</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Doppelt angelegte Firmen werden zusammengeführt. Anrufe, Verträge und Notizen wandern
            auf den behaltenen Lead, das Duplikat wird archiviert (umkehrbar).
          </p>
        </div>
        {clusters.length > 0 && <MergeAllButton disabled={false} />}
      </div>

      {clusters.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white p-12 text-center dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
          <Copy className="h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Keine Duplikate gefunden.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {clusters.length} Gruppen · {totalDuplicates} Duplikate
          </p>
          <div className="space-y-4">
            {clusters.map((c) => (
              <div
                key={c.survivor.id}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#161618]"
              >
                <div className="border-b border-gray-100 px-4 py-3 dark:border-[#2c2c2e]/40">
                  <span className="text-xs font-medium uppercase tracking-wider text-green-600 dark:text-green-400">
                    Behalten
                  </span>
                  <LeadLine lead={c.survivor} />
                </div>
                <div className="divide-y divide-gray-100 px-4 dark:divide-[#2c2c2e]/40">
                  {c.losers.map((l) => (
                    <div key={l.id} className="py-2">
                      <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
                        Wird zusammengeführt
                      </span>
                      <LeadLine lead={l} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LeadLine({
  lead,
}: {
  lead: { company_name: string | null; website: string | null; city: string | null; activity: number };
}) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="font-medium text-gray-900 dark:text-white">{lead.company_name ?? "—"}</span>
      {lead.website && <span className="text-gray-500 dark:text-gray-400">{lead.website}</span>}
      {lead.city && <span className="text-gray-400">{lead.city}</span>}
      {lead.activity > 0 && (
        <span className="inline-flex items-center gap-1 text-xs text-gray-400">
          <Phone className="h-3 w-3" />
          {lead.activity}
        </span>
      )}
    </div>
  );
}
