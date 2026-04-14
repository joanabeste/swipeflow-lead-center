import { createServiceClient } from "@/lib/supabase/server";
import { ImportTabs } from "./import-tabs";
import { ImportHistory } from "./import-history";

// Diese Seite darf nicht gecacht werden — Import-Historie muss nach jedem Import frisch sein
export const dynamic = "force-dynamic";
export const revalidate = 0;
// Server Actions auf dieser Page (z.B. Imports) dürfen bis zu 5 Min laufen
export const maxDuration = 300;

export default async function ImportPage() {
  const db = createServiceClient();

  const { data: templates } = await db
    .from("mapping_templates")
    .select("*")
    .order("name");

  // Robust gegen alte Schemata: zuerst minimale Spalten, dann Full-Select
  const { data: imports, error: importsError, count } = await db
    .from("import_logs")
    .select("id, file_name, row_count, imported_count, duplicate_count, error_count, status, created_at, import_type, source_url, updated_count, skipped_count", { count: "exact" })
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

      <div className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">Vergangene Imports</h2>
          {count != null && count > 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {imports?.length ?? 0} von {count} angezeigt
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Lösche einen Import, wenn du alle zugehörigen Leads wieder entfernen willst.
        </p>
        {importsError && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
            <p className="font-medium">Fehler beim Laden der Historie</p>
            <p className="mt-1 font-mono text-xs">{importsError.message} (Code: {importsError.code ?? "?"})</p>
          </div>
        )}
        <ImportHistory imports={imports ?? []} />
      </div>
    </div>
  );
}
