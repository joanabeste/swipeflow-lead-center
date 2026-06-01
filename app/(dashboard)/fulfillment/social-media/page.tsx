import Link from "next/link";
import { Megaphone, Link2, Clock3, CheckCircle2 } from "lucide-react";
import { listCustomersWithBoardStats } from "@/lib/social/data";

export const dynamic = "force-dynamic";

export default async function SocialMediaOverviewPage() {
  const rows = await listCustomersWithBoardStats();

  // Kunden mit offener Freigabe / Aktivität zuerst.
  const sorted = [...rows].sort((a, b) => b.pending - a.pending || b.total - a.total);

  return (
    <div className="space-y-6">
      <header>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
          <Megaphone className="h-3.5 w-3.5" /> Social Media
        </span>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">Content-Planung & Freigabe</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Beiträge je Kunde anlegen, planen und über einen Freigabelink abnehmen lassen.
        </p>
      </header>

      {sorted.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-400 dark:border-[#2c2c2e]/60">
          Noch keine Kunden vorhanden. Kunden entstehen aus Leads mit Lebenszyklus „Kunde&quot;.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map(({ customer, board, total, pending, approved }) => (
            <li key={customer.id}>
              <Link
                href={`/fulfillment/social-media/${customer.id}`}
                className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-primary hover:shadow-md dark:border-[#2c2c2e]/50 dark:bg-[#161618]"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-semibold text-gray-900 dark:text-white" title={customer.company_name ?? undefined}>
                    {customer.company_name ?? "—"}
                  </p>
                  {board?.share_token && board.share_enabled && (
                    <span title="Freigabelink aktiv" className="shrink-0 text-primary">
                      <Link2 className="h-4 w-4" />
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                  <span>{total} {total === 1 ? "Beitrag" : "Beiträge"}</span>
                  {pending > 0 && (
                    <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
                      <Clock3 className="h-3.5 w-3.5" /> {pending} zur Freigabe
                    </span>
                  )}
                  {approved > 0 && (
                    <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                      <CheckCircle2 className="h-3.5 w-3.5" /> {approved} freigegeben
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
