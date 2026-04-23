import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Lead, LeadStatus } from "@/lib/types";
import { LeadTableWrapper } from "./lead-table-wrapper";
import { getAllEnrichmentDefaults } from "@/lib/enrichment/defaults";

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

const PAGE_SIZE = 50;

export default async function LeadsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const offset = (page - 1) * PAGE_SIZE;
  const sort = params.sort ?? "updated_at";
  const order = (params.order ?? "desc") as "asc" | "desc";
  const includeCrm = params.include_crm === "1";

  const supabase = await createClient();

  // Benutzer-Spalten-Präferenzen laden
  const { data: { user } } = await supabase.auth.getUser();
  let visibleColumns: string[] | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("lead_table_columns")
      .eq("id", user.id)
      .single();
    visibleColumns = profile?.lead_table_columns as string[] | null;
  }

  let query = supabase
    .from("leads")
    .select("*", { count: "exact" })
    .is("deleted_at", null);

  if (params.q) {
    query = query.or(
      `company_name.ilike.%${params.q}%,domain.ilike.%${params.q}%,city.ilike.%${params.q}%`,
    );
  }

  if (params.status) {
    query = query.eq("status", params.status as LeadStatus);
  }

  // Standardmäßig keine CRM-Leads zeigen (die sind im CRM-Bereich zuhause).
  // Kriterium "im CRM": crm_status_id gesetzt ODER status in (qualified, exported).
  // Override via URL-Param: ?include_crm=1
  if (!includeCrm) {
    query = query
      .is("crm_status_id", null)
      .not("status", "in", '("qualified","exported")');
  }

  // Spalten-Filter anwenden
  const columnFilters: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith("filter_") && value) {
      const col = key.replace("filter_", "");
      columnFilters[col] = value;
      query = query.ilike(col, `%${value}%`);
    }
  }

  const { data: leads, count } = await query
    .order(sort, { ascending: order === "asc" })
    .range(offset, offset + PAGE_SIZE - 1);

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);

  const enrichmentDefaults = await getAllEnrichmentDefaults();

  // Toggle-Link baut URL mit gedrehtem include_crm-Param.
  const toggleParams = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && k !== "include_crm" && k !== "page") toggleParams.set(k, v);
  }
  if (!includeCrm) toggleParams.set("include_crm", "1");
  const toggleHref = `/leads${toggleParams.toString() ? `?${toggleParams.toString()}` : ""}`;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {includeCrm ? "Alle Leads" : "Neue Leads"}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {count ?? 0} Leads
            {!includeCrm && " — im CRM liegende sind ausgeblendet"}
          </p>
        </div>
        <Link
          href={toggleHref}
          className="text-xs font-medium text-primary hover:underline"
        >
          {includeCrm ? "Nur neue Leads zeigen" : "Auch CRM-Leads zeigen"}
        </Link>
      </div>

      <LeadTableWrapper
        leads={(leads as Lead[]) ?? []}
        totalPages={totalPages}
        currentPage={page}
        currentSort={sort}
        currentOrder={order}
        currentQuery={params.q ?? ""}
        currentStatus={params.status ?? ""}
        currentFilters={columnFilters}
        visibleColumns={visibleColumns}
        enrichmentDefaults={enrichmentDefaults}
      />
    </div>
  );
}
