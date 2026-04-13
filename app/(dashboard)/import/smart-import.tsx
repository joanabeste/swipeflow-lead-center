"use client";

import { useState, useTransition } from "react";
import { Upload, Loader2, Check, FileSpreadsheet, Briefcase, MapPin, Info } from "lucide-react";
import { parseCSV, detectDelimiter, decodeBuffer } from "@/lib/csv/parser";
import { detectCsvFormat, GOOGLE_MAPS_COLUMNS, type CsvFormat } from "@/lib/csv/format-detector";
import { hubspotFields, knownColumnAliases } from "@/lib/hubspot/schema";
import { processImport } from "./actions";
import { processJobListingImport } from "./job-listing-actions";
import { processGoogleMapsImport } from "./google-maps-actions";
import type { MappingTemplate } from "@/lib/types";

interface Props {
  templates: MappingTemplate[];
}

interface PreviewRow {
  cells: string[];
}

type Phase = "upload" | "detected" | "mapping" | "result";

const FORMAT_ICONS: Record<CsvFormat, typeof FileSpreadsheet> = {
  job_listing: Briefcase,
  google_maps: MapPin,
  standard: FileSpreadsheet,
};

export function SmartImport({ templates }: Props) {
  const [phase, setPhase] = useState<Phase>("upload");
  const [fileContent, setFileContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [format, setFormat] = useState<CsvFormat>("standard");
  const [formatLabel, setFormatLabel] = useState("");
  const [formatDesc, setFormatDesc] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [allRows, setAllRows] = useState<string[][]>([]);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [delimiter, setDelimiter] = useState(",");

  // Standard-CSV Mapping
  const [mapping, setMapping] = useState<Record<string, string>>({});

  const [importPending, startImport] = useTransition();
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<{
    imported?: number;
    updated?: number;
    contacts?: number;
    jobs?: number;
    skipped?: number;
    duplicates?: number;
    errors?: number;
    error?: string;
  } | null>(null);

  function truncate(s: string | undefined, max: number): string {
    if (!s) return "–";
    const clean = s.replace(/\n/g, " ").trim();
    return clean.length > max ? clean.slice(0, max - 1) + "…" : clean || "–";
  }

  async function processFile(file: File) {
    setFileName(file.name);
    const buffer = await file.arrayBuffer();
    const text = decodeBuffer(buffer);
    setFileContent(text);

    const det = detectDelimiter(text);
    setDelimiter(det);
    const { headers: h, rows } = parseCSV(text, det);
    setHeaders(h);
    setAllRows(rows);

    // Format erkennen
    const detection = detectCsvFormat(h, rows.slice(0, 3));
    setFormat(detection.format);
    setFormatLabel(detection.label);
    setFormatDesc(detection.description);

    // Vorschau bauen je nach Format
    const validRows = rows.filter((r) => r.some((c) => c.trim()));

    if (detection.format === "job_listing") {
      const companyIdx = h.findIndex((x) => x.toLowerCase().trim() === "kontakt");
      const contactIdx = h.findIndex((x) => x.toLowerCase().trim() === "ansprechpartner");
      const emailIdx = h.findIndex((x) => x.toLowerCase().trim().includes("e-mail"));
      const phoneIdx = h.findIndex((x) => x.toLowerCase().trim() === "telefon");
      const jobIdx = h.findIndex((x) => x.toLowerCase().trim() === "stelle");

      setPreviewHeaders(["Firma", "Kontakt", "E-Mail", "Telefon", "Stelle"]);
      setPreview(validRows.slice(0, 15).map((r) => ({
        cells: [
          truncate(r[companyIdx], 35),
          truncate(r[contactIdx], 25),
          truncate(r[emailIdx], 30),
          truncate(r[phoneIdx], 18),
          truncate(r[jobIdx], 30),
        ],
      })));
      setTotalRows(validRows.filter((r) => r[companyIdx]?.trim()).length);
      setPhase("detected");
    } else if (detection.format === "google_maps") {
      const col = GOOGLE_MAPS_COLUMNS;
      setPreviewHeaders(["Firma", "Bewertung", "Branche", "Adresse", "Telefon", "Website"]);
      setPreview(validRows.slice(0, 15).map((r) => ({
        cells: [
          truncate(r[col.companyName], 35),
          truncate(r[col.rating], 5),
          truncate(r[col.category], 20),
          truncate(r[col.address], 25),
          truncate(r[col.phone], 18),
          truncate(r[col.website], 25),
        ],
      })));
      setTotalRows(validRows.filter((r) => r[col.companyName]?.trim()).length);
      setPhase("detected");
    } else {
      // Standard CSV → Auto-Mapping + Mapping-Schritt
      const autoMapping: Record<string, string> = {};
      h.forEach((header) => {
        const normalized = header.toLowerCase().trim();
        const match = knownColumnAliases[normalized];
        if (match) autoMapping[header] = match;
      });
      setMapping(autoMapping);

      setPreviewHeaders(h.slice(0, 6));
      setPreview(validRows.slice(0, 10).map((r) => ({
        cells: h.slice(0, 6).map((_, i) => truncate(r[i], 30)),
      })));
      setTotalRows(validRows.length);
      setPhase("mapping");
    }
  }

  function handleImport() {
    startImport(async () => {
      if (format === "job_listing") {
        const res = await processJobListingImport(fileContent);
        setResult(res);
      } else if (format === "google_maps") {
        const res = await processGoogleMapsImport(allRows);
        setResult(res);
      } else {
        const res = await processImport(fileContent, mapping, delimiter);
        setResult(res);
      }
      setPhase("result");
    });
  }

  function reset() {
    setPhase("upload");
    setFileContent("");
    setFileName("");
    setResult(null);
    setPreview([]);
    setMapping({});
  }

  const FormatIcon = FORMAT_ICONS[format];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      {/* Upload */}
      {phase === "upload" && (
        <div
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) processFile(f); }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
        >
          <label className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition ${
            dragging ? "border-primary bg-primary/5" : "border-gray-300 hover:border-primary dark:border-gray-700"
          }`}>
            <Upload className={`h-10 w-10 ${dragging ? "text-primary" : "text-gray-400"}`} />
            <p className="mt-2 text-sm font-medium">CSV-Datei auswählen oder hierher ziehen</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Firmendaten, Stellenanzeigen oder Google Maps — wird automatisch erkannt
            </p>
            <input type="file" accept=".csv,.txt" onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }} className="hidden" />
          </label>
        </div>
      )}

      {/* Erkannt (BA / Google Maps) */}
      {phase === "detected" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl bg-primary/5 p-4">
            <FormatIcon className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium">Erkannt: {formatLabel}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{formatDesc} — {totalRows} Einträge</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-[#2c2c2e]">
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-[#2c2c2e]">
              <thead className="bg-gray-50 dark:bg-[#1c1c1e]">
                <tr>
                  {previewHeaders.map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-[#2c2c2e]">
                {preview.map((row, i) => (
                  <tr key={i}>
                    {row.cells.map((cell, j) => (
                      <td key={j} className="px-3 py-2 text-gray-600 dark:text-gray-400">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalRows > 15 && <p className="text-xs text-gray-400">Vorschau: erste 15 von {totalRows}</p>}

          <div className="flex gap-2">
            <button onClick={reset} className="rounded-lg border border-gray-200 px-4 py-2 text-sm dark:border-gray-700">Zurück</button>
            <button
              onClick={handleImport}
              disabled={importPending}
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
            >
              {importPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {importPending ? "Importiere…" : `${totalRows} importieren`}
            </button>
          </div>
        </div>
      )}

      {/* Mapping (Standard CSV) */}
      {phase === "mapping" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-4 dark:bg-[#161618]">
            <Info className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-sm font-medium">Spalten zuordnen — {fileName}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{totalRows} Zeilen, Trennzeichen: {delimiter === ";" ? "Semikolon" : delimiter === "\t" ? "Tab" : "Komma"}</p>
            </div>
          </div>

          {templates.length > 0 && (
            <select
              onChange={(e) => {
                const t = templates.find((t) => t.id === e.target.value);
                if (t) { setMapping(t.mapping); setDelimiter(t.delimiter); }
              }}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-[#1c1c1e] dark:text-gray-100"
              defaultValue=""
            >
              <option value="" disabled>Template laden…</option>
              {templates.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
            </select>
          )}

          <div className="max-h-80 space-y-2 overflow-y-auto">
            {headers.map((header) => (
              <div key={header} className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2 dark:border-[#2c2c2e]">
                <span className="w-1/3 text-sm font-medium">{header}</span>
                <span className="text-gray-400">→</span>
                <select
                  value={mapping[header] ?? ""}
                  onChange={(e) => setMapping((prev) => ({ ...prev, [header]: e.target.value }))}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-[#1c1c1e] dark:text-gray-100"
                >
                  <option value="">— Nicht zuordnen —</option>
                  {hubspotFields.map((f) => (<option key={f.key} value={f.key}>{f.label}</option>))}
                </select>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button onClick={reset} className="rounded-lg border border-gray-200 px-4 py-2 text-sm dark:border-gray-700">Zurück</button>
            <button
              onClick={handleImport}
              disabled={importPending || (!mapping.company_name && !Object.values(mapping).includes("company_name"))}
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
            >
              {importPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {importPending ? "Importiere…" : "Importieren"}
            </button>
          </div>
        </div>
      )}

      {/* Ergebnis */}
      {phase === "result" && result && (
        <div className="space-y-4">
          {result.error ? (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">{result.error}</div>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
                <Check className="h-4 w-4" />
                Import abgeschlossen
              </div>
              <div className="flex flex-wrap gap-3">
                {result.imported != null && result.imported > 0 && (
                  <div className="rounded-lg border border-gray-200 px-4 py-2 text-center dark:border-[#2c2c2e]">
                    <p className="text-xl font-bold">{result.imported}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Importiert</p>
                  </div>
                )}
                {result.updated != null && result.updated > 0 && (
                  <div className="rounded-lg border border-gray-200 px-4 py-2 text-center dark:border-[#2c2c2e]">
                    <p className="text-xl font-bold">{result.updated}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Aktualisiert</p>
                  </div>
                )}
                {result.contacts != null && result.contacts > 0 && (
                  <div className="rounded-lg border border-gray-200 px-4 py-2 text-center dark:border-[#2c2c2e]">
                    <p className="text-xl font-bold">{result.contacts}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Kontakte</p>
                  </div>
                )}
                {result.jobs != null && result.jobs > 0 && (
                  <div className="rounded-lg border border-gray-200 px-4 py-2 text-center dark:border-[#2c2c2e]">
                    <p className="text-xl font-bold">{result.jobs}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Stellen</p>
                  </div>
                )}
                {result.duplicates != null && result.duplicates > 0 && (
                  <div className="rounded-lg border border-gray-200 px-4 py-2 text-center dark:border-[#2c2c2e]">
                    <p className="text-xl font-bold">{result.duplicates}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Duplikate</p>
                  </div>
                )}
                {result.skipped != null && result.skipped > 0 && (
                  <div className="rounded-lg border border-gray-200 px-4 py-2 text-center dark:border-[#2c2c2e]">
                    <p className="text-xl font-bold">{result.skipped}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Übersprungen</p>
                  </div>
                )}
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
