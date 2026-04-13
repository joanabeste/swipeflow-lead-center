"use client";

import { useState, useTransition } from "react";
import { Upload, Loader2, Check, FileSpreadsheet } from "lucide-react";
import { parseCSV, detectDelimiter, decodeBuffer } from "@/lib/csv/parser";
import { processJobListingImport } from "./job-listing-actions";

interface PreviewRow {
  company: string;
  contact: string;
  email: string;
  phone: string;
  job: string;
}

export function JobListingImport() {
  const [phase, setPhase] = useState<"upload" | "preview" | "result">("upload");
  const [fileContent, setFileContent] = useState("");
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [importPending, startImport] = useTransition();
  const [result, setResult] = useState<{
    imported: number;
    updated: number;
    contacts: number;
    jobs: number;
    skipped: number;
    error?: string;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  async function processFile(file: File) {
    const buffer = await file.arrayBuffer();
    const text = decodeBuffer(buffer);
    setFileContent(text);

    const delimiter = detectDelimiter(text);
    const { headers, rows } = parseCSV(text, delimiter);

    // Spalte "Kontakt" (Firmenname) finden
    const companyIdx = headers.findIndex((h) => h.toLowerCase().trim() === "kontakt");
    const contactIdx = headers.findIndex((h) => h.toLowerCase().trim() === "ansprechpartner");
    const emailIdx = headers.findIndex((h) => h.toLowerCase().trim().includes("e-mail"));
    const phoneIdx = headers.findIndex((h) => h.toLowerCase().trim() === "telefon");
    const jobIdx = headers.findIndex((h) => h.toLowerCase().trim() === "stelle");

    const previewRows: PreviewRow[] = rows.slice(0, 20).map((row) => ({
      company: row[companyIdx] ?? "–",
      contact: row[contactIdx] ?? "–",
      email: row[emailIdx] ?? "–",
      phone: row[phoneIdx] ?? "–",
      job: row[jobIdx] ?? "–",
    }));

    setPreview(previewRows);
    setTotalRows(rows.filter((r) => r[companyIdx]?.trim()).length);
    setPhase("preview");
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  function handleImport() {
    startImport(async () => {
      const res = await processJobListingImport(fileContent);
      setResult(res);
      setPhase("result");
    });
  }

  function reset() {
    setPhase("upload");
    setFileContent("");
    setPreview([]);
    setResult(null);
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-[#1c1c1e]">
      <h3 className="flex items-center gap-2 font-medium">
        <FileSpreadsheet className="h-4 w-4 text-primary" />
        Stellenanzeigen importieren (BA-Format)
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        CSV der Bundesagentur für Arbeit mit Stellenanzeigen, Ansprechpartnern und Kontaktdaten.
        Leads, Kontakte und Stellen werden automatisch erstellt.
      </p>

      {/* Upload */}
      {phase === "upload" && (
        <div
          className="mt-4"
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
        >
          <label className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 transition ${
            dragging ? "border-primary bg-primary/5" : "border-gray-300 hover:border-primary dark:border-gray-700"
          }`}>
            <Upload className={`h-8 w-8 ${dragging ? "text-primary" : "text-gray-400"}`} />
            <p className="mt-2 text-sm font-medium">Stellenanzeigen-CSV auswählen oder hierher ziehen</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Format: Kontakt, E-Mail, Ansprechpartner, Telefon, Stelle, Beschreibung…
            </p>
            <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>
      )}

      {/* Vorschau */}
      {phase === "preview" && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{totalRows} Stellenanzeigen erkannt</p>
            <div className="flex gap-2">
              <button onClick={reset} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm dark:border-gray-700">
                Zurück
              </button>
              <button
                onClick={handleImport}
                disabled={importPending}
                className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
              >
                {importPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {importPending ? "Importiere…" : "Importieren"}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Firma</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Kontakt</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">E-Mail</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Telefon</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Stelle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {preview.map((row, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 font-medium">{row.company}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{row.contact}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{row.email}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{row.phone}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{row.job}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalRows > 20 && (
            <p className="text-xs text-gray-400">Vorschau: erste 20 von {totalRows} Einträgen</p>
          )}
        </div>
      )}

      {/* Ergebnis */}
      {phase === "result" && result && (
        <div className="mt-4 space-y-4">
          {result.error ? (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">{result.error}</div>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
                <Check className="h-4 w-4" />
                Import abgeschlossen
              </div>
              <div className="grid grid-cols-5 gap-3">
                <div className="rounded-lg border border-gray-200 p-3 text-center dark:border-gray-800">
                  <p className="text-2xl font-bold">{result.imported}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Neue Leads</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3 text-center dark:border-gray-800">
                  <p className="text-2xl font-bold">{result.updated}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Aktualisiert</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3 text-center dark:border-gray-800">
                  <p className="text-2xl font-bold">{result.contacts}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Kontakte</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3 text-center dark:border-gray-800">
                  <p className="text-2xl font-bold">{result.jobs}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Stellen</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3 text-center dark:border-gray-800">
                  <p className="text-2xl font-bold">{result.skipped}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Übersprungen</p>
                </div>
              </div>
            </>
          )}
          <button onClick={reset} className="rounded-lg border border-gray-200 px-4 py-2 text-sm dark:border-gray-700">
            Neuen Import starten
          </button>
        </div>
      )}
    </div>
  );
}
