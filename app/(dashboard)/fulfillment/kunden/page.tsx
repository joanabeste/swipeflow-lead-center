import { Search, Users } from "lucide-react";
import { listCustomersWithActiveProject } from "@/lib/fulfillment/data";
import { CreateCustomerButton } from "./_components/create-customer-button";
import { CustomersTable } from "./_components/customers-table";

export default async function KundenListePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const q = sp.q?.trim().toLowerCase() ?? "";
  const all = await listCustomersWithActiveProject();
  const filtered = q ? all.filter((c) => (c.company_name ?? "").toLowerCase().includes(q)) : all;

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
                placeholder="Name suchen…"
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
        <CustomersTable
          rows={filtered.map((c) => ({
            id: c.id,
            company_name: c.company_name ?? "—",
            became_customer_at: c.became_customer_at ?? null,
            active_project: c.active_project,
          }))}
        />
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
