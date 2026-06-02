"use client";

import { useState, useTransition } from "react";
import { Trash2, FileSpreadsheet, Globe, List, MapPin, Briefcase, Download } from "lucide-react";
import { deleteImport, loadMoreImports } from "./actions";

interface ImportLog {
  id: string;
  file_name: string;
  row_count: number;
  imported_count: number;
  duplicate_count: number;
  error_count: number;
  status: string;
  created_at: string;
  import_type?: string | null;
  source_url?: string | null;
  updated_count?: number | null;
  csv_storage_path?: string | null;
  csv_expires_at?: string | null;
}

interface Props {
  imports: ImportLog[];
  /** Gesamtanzahl aller Imports in der DB (für "X von Y angezeigt"). */
  total: number;
  /** Fehler beim initialen Laden der Historie (server-seitig). */
  error?: { message: string; code?: string } | null;
}

function typeBadge(type?: string | null) {
  const map: Record<string, { label: string; Icon: typeof FileSpreadsheet; tone: string }> = {
    csv: { label: "CSV", Icon: FileSpreadsheet, tone: "bg-gray-100 text-gray-700 dark:bg-[#232325] dark:text-gray-300" },
    ba_job_listing: { label: "BA-Stellen", Icon: Briefcase, tone: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    google_maps: { label: "Google Maps", Icon: MapPin, tone: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
    url: { label: "URL", Icon: Globe, tone: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
    directory: { label: "Verzeichnis", Icon: List, tone: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  };
  const info = (type && map[type]) || { label: type ?? "–", Icon: FileSpreadsheet, tone: "bg-gray-100 text-gray-700 dark:bg-[#232325] dark:text-gray-300" };
  const { Icon } = info;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${info.tone}`}>
      <Icon className="h-3 w-3" />
      {info.label}
    </span>
  );
}

export function ImportHistory({ imports, total, error }: Props) {
  // Liste + Gesamtanzahl lokal mitführen: wächst durch "Mehr laden",
  // schrumpft durch Löschen — ohne dass die ganze Seite neu lädt.
  const [items, setItems] = useState<ImportLog[]>(imports);
  const [totalCount, setTotalCount] = useState(total);
  const [isPending, startTransition] = useTransition();
  const [isLoadingMore, startLoadingMore] = useTransition();
  const [loadError, setLoadError] = useState<string | null>(null);

  const hasMore = items.length < totalCount;

  function handleDelete(imp: ImportLog) {
    if (!confirm(`Import "${imp.file_name}" mit ${imp.imported_count} Leads wirklich löschen?`)) return;
    startTransition(async () => {
      const res = await deleteImport(imp.id);
      if (res?.error) {
        alert(res.error);
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== imp.id));
      setTotalCount((c) => Math.max(0, c - 1));
    });
  }

  function handleLoadMore() {
    setLoadError(null);
    startLoadingMore(async () => {
      const res = await loadMoreImports(items.length);
      if (res?.error) {
        setLoadError(res.error);
        return;
      }
      const more = (res.imports ?? []) as unknown as ImportLog[];
      // Dedup per id — schützt vor Doppeln, falls sich die Reihenfolge
      // zwischen den Seiten verschiebt (z.B. nach einem Löschvorgang).
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...more.filter((m) => !seen.has(m.id))];
      });
    });
  }

  return (
    <>
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold">Vergangene Imports</h2>
        {totalCount > 0 && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {items.length} von {totalCount} angezeigt
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Lösche einen Import, wenn du alle zugehörigen Leads wieder entfernen willst.
      </p>
      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
          <p className="font-medium">Fehler beim Laden der Historie</p>
          <p className="mt-1 font-mono text-xs">{error.message} (Code: {error.code ?? "?"})</p>
        </div>
      )}

      {items.length === 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
          Noch keine Imports. Lade eine CSV hoch oder gib eine URL ein, um loszulegen.
        </div>
      ) : (
        <>
          <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-[#2c2c2e]">
              <thead className="bg-gray-50 dark:bg-[#232325]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Quelle</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Typ</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Zeilen</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Neu</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Aktualisiert</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Duplikate</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Fehler</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Datum</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-[#2c2c2e]">
                {items.map((imp) => (
                  <tr key={imp.id} className={isPending ? "opacity-50" : ""}>
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium">{imp.file_name}</div>
                      {imp.source_url && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[260px]">{imp.source_url}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">{typeBadge(imp.import_type)}</td>
                    <td className="px-4 py-3 text-right text-sm">{imp.row_count}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium">{imp.imported_count}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-500 dark:text-gray-400">{imp.updated_count ?? 0}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-500 dark:text-gray-400">{imp.duplicate_count}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-500 dark:text-gray-400">{imp.error_count}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        imp.status === "completed" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                        imp.status === "failed" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                        "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                      }`}>
                        {imp.status === "completed" ? "Abgeschlossen" :
                         imp.status === "failed" ? "Fehlgeschlagen" :
                         imp.status === "processing" ? "Läuft…" : "Ausstehend"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {new Date(imp.created_at).toLocaleString("de-DE")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        {imp.csv_storage_path && (
                          <a
                            href={`/api/import/${imp.id}/download`}
                            title={
                              imp.csv_expires_at
                                ? `Original-CSV herunterladen (verfuegbar bis ${new Date(imp.csv_expires_at).toLocaleDateString("de-DE")})`
                                : "Original-CSV herunterladen"
                            }
                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        )}
                        <button
                          onClick={() => handleDelete(imp)}
                          disabled={isPending}
                          className="text-red-500 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
                          title="Import und alle zugehörigen Leads löschen"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {loadError && (
            <p className="mt-3 text-center text-sm text-red-600 dark:text-red-400">{loadError}</p>
          )}

          {hasMore && (
            <div className="mt-3 flex justify-center">
              <button
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-[#2c2c2e] dark:bg-[#1c1c1e] dark:text-gray-300 dark:hover:bg-[#232325]"
              >
                {isLoadingMore ? "Lädt…" : `Mehr laden (${totalCount - items.length} verbleibend)`}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
