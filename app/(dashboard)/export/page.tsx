import { createClient } from "@/lib/supabase/server";
import { ExportManager } from "./export-manager";

export default async function ExportPage() {
  const supabase = await createClient();

  const [{ data: qualifiedLeads, count }, { data: exportLogs }] =
    await Promise.all([
      supabase
        .from("leads")
        .select("id, company_name, domain, city, status", { count: "exact" })
        .eq("status", "qualified")
        .order("company_name"),
      supabase
        .from("export_logs")
        .select("*, leads(company_name)")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">HubSpot-Export</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {count ?? 0} qualifizierte Leads bereit zum Export
      </p>

      <ExportManager
        qualifiedLeads={qualifiedLeads ?? []}
        exportLogs={exportLogs ?? []}
      />
    </div>
  );
}
