import { createServiceClient } from "@/lib/supabase/server";
import { ImportTabs } from "./import-tabs";
import { ImportHistory } from "./import-history";

export default async function ImportPage() {
  const db = createServiceClient();

  const { data: templates } = await db
    .from("mapping_templates")
    .select("*")
    .order("name");

  const { data: imports } = await db
    .from("import_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Import</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Leads aus verschiedenen Quellen importieren
      </p>

      <div className="mt-6">
        <ImportTabs templates={templates ?? []} />
      </div>

      {imports && imports.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-bold">Vergangene Imports</h2>
          <ImportHistory imports={imports} />
        </div>
      )}
    </div>
  );
}
