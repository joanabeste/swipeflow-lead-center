import Link from "next/link";
import { Search, Users } from "lucide-react";
import { listCustomers } from "@/lib/fulfillment/data";
import { formatDateDe } from "@/lib/zeit/format";
import { CreateCustomerButton } from "./_components/create-customer-button";

export default async function KundenListePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const q = sp.q?.trim().toLowerCase() ?? "";
  const all = await listCustomers();
  const filtered = q ? all.filter((c) => (c.company_name ?? "").toLowerCase().includes(q) || (c.city ?? "").toLowerCase().includes(q)) : all;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Kunden</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {all.length} {all.length === 1 ? "Kunde" : "Kunden"} im Fulfillment
          </p>
        </div>
        <div className="flex items-center gap-2">
          <form>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="Name oder Stadt suchen…"
                className="w-64 rounded-xl border border-gray-200 bg-white py-2 pl-8 pr-3 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#161618] dark:text-gray-100"
              />
            </div>
          </form>
          <CreateCustomerButton />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState hasQuery={!!q} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 dark:bg-[#1c1c1e]">
              <tr>
                <th className="px-4 py-3 text-left">Firma</th>
                <th className="px-4 py-3 text-left">Stadt</th>
                <th className="px-4 py-3 text-left">Vertikale</th>
                <th className="px-4 py-3 text-left">Kunde seit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-[#2c2c2e]/40">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <Link href={`/fulfillment/kunden/${c.id}`} className="font-medium text-gray-900 hover:text-primary dark:text-white">
                      {c.company_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{c.city ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c.vertical ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c.became_customer_at ? formatDateDe(c.became_customer_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 p-12 text-center dark:border-[#2c2c2e]/60">
      <Users className="mx-auto h-8 w-8 text-gray-400" />
      <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-200">
        {hasQuery ? "Keine Kunden gefunden." : "Noch keine Kunden."}
      </p>
      <p className="mt-1 text-xs text-gray-500">
        {hasQuery
          ? "Suche anpassen oder neue Kunden im CRM markieren (Lifecycle = Kunde)."
          : "Markiere im CRM einen Lead als Kunde, um ihn hier zu sehen."}
      </p>
    </div>
  );
}
