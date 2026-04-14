"use client";

import { useTransition } from "react";
import { Trash2, FileSpreadsheet, Globe, List, MapPin, Briefcase } from "lucide-react";
import { deleteImport } from "./actions";

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
}

interface Props {
  imports: ImportLog[];
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

export function ImportHistory({ imports }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleDelete(imp: ImportLog) {
    if (!confirm(`Import "${imp.file_name}" mit ${imp.imported_count} Leads wirklich löschen?`)) return;
    startTransition(async () => {
      await deleteImport(imp.id);
    });
  }

  if (imports.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        Noch keine Imports. Lade eine CSV hoch oder gib eine URL ein, um loszulegen.
      </div>
    );
  }

  return (
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
          {imports.map((imp) => (
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
                <button
                  onClick={() => handleDelete(imp)}
                  disabled={isPending}
                  className="text-red-500 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
                  title="Import und alle zugehörigen Leads löschen"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
