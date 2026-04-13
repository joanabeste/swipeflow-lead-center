"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
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
}

interface Props {
  imports: ImportLog[];
}

export function ImportHistory({ imports }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleDelete(imp: ImportLog) {
    if (!confirm(`Import "${imp.file_name}" mit ${imp.imported_count} Leads wirklich löschen?`)) {
      return;
    }
    startTransition(async () => {
      await deleteImport(imp.id);
    });
  }

  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-[#2c2c2e]">
        <thead className="bg-gray-50 dark:bg-[#232325]">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Datei</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Zeilen</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Importiert</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Duplikate</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Fehler</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Datum</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-[#2c2c2e]">
          {imports.map((imp) => (
            <tr key={imp.id} className={isPending ? "opacity-50" : ""}>
              <td className="px-4 py-3 text-sm">{imp.file_name}</td>
              <td className="px-4 py-3 text-sm">{imp.row_count}</td>
              <td className="px-4 py-3 text-sm">{imp.imported_count}</td>
              <td className="px-4 py-3 text-sm">{imp.duplicate_count}</td>
              <td className="px-4 py-3 text-sm">{imp.error_count}</td>
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
