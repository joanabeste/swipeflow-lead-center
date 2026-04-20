"use client";

import { useState, useTransition } from "react";
import { List, Loader2, Search, Check, Upload } from "lucide-react";
import { discoverFromDirectory, createLeadsFromDirectory } from "./url-actions";

interface DiscoveredCompany {
  name: string;
  website: string | null;
  description: string | null;
}

export function DirectoryImport() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<"input" | "preview" | "result">("input");
  const [companies, setCompanies] = useState<DiscoveredCompany[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [discoverPending, startDiscover] = useTransition();
  const [importPending, startImport] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; filtered: number } | null>(null);

  function handleDiscover(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setError(null);
    startDiscover(async () => {
      const res = await discoverFromDirectory(url.trim());
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.companies.length === 0) {
        setError("Keine Unternehmen auf dieser Seite erkannt.");
        return;
      }
      setCompanies(res.companies);
      setSelected(new Set(res.companies.map((_, i) => i)));
      setPhase("preview");
    });
  }

  function toggleAll() {
    if (selected.size === companies.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(companies.map((_, i) => i)));
    }
  }

  function toggleOne(index: number) {
    const next = new Set(selected);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelected(next);
  }

  function handleImport() {
    const selectedCompanies = companies
      .filter((_, i) => selected.has(i))
      .map((c) => ({ name: c.name, website: c.website }));

    startImport(async () => {
      const res = await createLeadsFromDirectory(selectedCompanies, url.trim());
      if (res.error) {
        setError(res.error);
        return;
      }
      setResult({ imported: res.imported, filtered: res.filtered });
      setPhase("result");
    });
  }

  function reset() {
    setUrl("");
    setPhase("input");
    setCompanies([]);
    setSelected(new Set());
    setError(null);
    setResult(null);
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      <h3 className="flex items-center gap-2 font-medium">
        <List className="h-4 w-4 text-primary" />
        Verzeichnis-URL importieren
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Geben Sie die URL einer Unternehmensübersicht ein (z.B. Branchenverzeichnis, LinkedIn-Liste). Die Unternehmen werden automatisch erkannt.
      </p>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Phase 1: URL eingeben */}
      {phase === "input" && (
        <form onSubmit={handleDiscover} className="mt-4 flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Verzeichnis-URL
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="z.B. https://verzeichnis.de/branche/gartenbau"
              required
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            />
          </div>
          <button
            type="submit"
            disabled={discoverPending || !url.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-gray-900 hover:bg-primary-dark disabled:opacity-50"
          >
            {discoverPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analysiere…
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Firmen erkennen
              </>
            )}
          </button>
        </form>
      )}

      {/* Phase 2: Vorschau */}
      {phase === "preview" && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {companies.length} Unternehmen erkannt — {selected.size} ausgewählt
            </p>
            <div className="flex gap-2">
              <button
                onClick={reset}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                Zurück
              </button>
              <button
                onClick={handleImport}
                disabled={importPending || selected.size === 0}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-gray-900 hover:bg-primary-dark disabled:opacity-50"
              >
                {importPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Importiere…
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    {selected.size} importieren
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-[#2c2c2e]">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-[#2c2c2e]">
              <thead className="bg-gray-50 dark:bg-[#232325]">
                <tr>
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.size === companies.length}
                      onChange={toggleAll}
                      className="rounded border-gray-300 dark:border-gray-600"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                    Firma
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                    Website
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                    Beschreibung
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-[#2c2c2e]">
                {companies.map((company, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(i)}
                        onChange={() => toggleOne(i)}
                        className="rounded border-gray-300 dark:border-gray-600"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">{company.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {company.website ?? "–"}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {company.description ?? "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Phase 3: Ergebnis */}
      {phase === "result" && result && (
        <div className="mt-4 space-y-3">
          <div className="rounded-md bg-green-50 p-4 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
            <Check className="mb-1 inline h-4 w-4" /> Import abgeschlossen: {result.imported} importiert, {result.filtered} gefiltert/ausgeschlossen.
          </div>
          <button
            onClick={reset}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            Neuen Import starten
          </button>
        </div>
      )}
    </div>
  );
}
