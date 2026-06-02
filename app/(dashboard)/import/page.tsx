import { ExternalLink, Briefcase } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchImportLogsPage, IMPORT_HISTORY_PAGE_SIZE } from "@/lib/csv/import-helpers";
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

  // Erste Seite der Import-Historie (neueste zuerst) inkl. Gesamtanzahl.
  // Der Helper ist robust gegen alte Schemata ohne CSV-Storage-Spalten und
  // wird vom "Mehr laden"-Button (loadMoreImports) wiederverwendet.
  const {
    data: imports,
    error: importsError,
    count,
  } = await fetchImportLogsPage(db, 0, IMPORT_HISTORY_PAGE_SIZE - 1, true);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Import</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Leads aus verschiedenen Quellen importieren
      </p>

      {/* Direkt-Link zur externen BA-Lead-Quelle — spart den User-Weg
          über Bookmarks, wenn er neue Stellenanzeigen scrapen will. */}
      <a
        href="https://swipeflow.maik.software/"
        target="_blank"
        rel="noreferrer"
        className="group mt-5 flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 to-primary/5 p-4 transition hover:border-primary hover:shadow-sm dark:border-primary/20"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Briefcase className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">Neue Leads scrapen — Swipeflow BA-Tool</p>
            <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
              Öffnet das externe Tool für Stellenanzeigen-Recherche aus der Bundesagentur für Arbeit. Anschließend als CSV hier importieren.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary group-hover:underline">
          Öffnen
          <ExternalLink className="h-3.5 w-3.5" />
        </span>
      </a>

      <div className="mt-6">
        <ImportTabs templates={templates ?? []} />
      </div>

      <div className="mt-10">
        <ImportHistory
          imports={(imports ?? []) as unknown as Parameters<typeof ImportHistory>[0]["imports"]}
          total={count ?? 0}
          error={importsError}
        />
      </div>
    </div>
  );
}
