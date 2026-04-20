"use client";

import { useState } from "react";
import { Upload, ArrowRight, ArrowLeft, Check, Loader2 } from "lucide-react";
import { parseCSV, detectDelimiter, decodeBuffer } from "@/lib/csv/parser";
import { leadFields, knownColumnAliases } from "@/lib/csv/lead-fields";
import { processImport } from "./actions";
import type { MappingTemplate } from "@/lib/types";

interface Props {
  templates: MappingTemplate[];
}

export function ImportWizard({ templates }: Props) {
  const [step, setStep] = useState(1);
  const [fileContent, setFileContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [delimiter, setDelimiter] = useState(",");
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [templateName, setTemplateName] = useState("");
  const [result, setResult] = useState<{
    success?: boolean;
    imported?: number;
    skipped?: number;
    duplicates?: number;
    errors?: number;
    error?: string;
  } | null>(null);
  const [processing, setProcessing] = useState(false);

  const [dragging, setDragging] = useState(false);

  async function processFile(file: File) {
    setFileName(file.name);
    const buffer = await file.arrayBuffer();
    const text = decodeBuffer(buffer);
    const detectedDelimiter = detectDelimiter(text);
    setDelimiter(detectedDelimiter);
    setFileContent(text);

    const { headers: h, rows } = parseCSV(text, detectedDelimiter);
    setHeaders(h);
    setPreviewRows(rows.slice(0, 10));

    // Auto-Mapping basierend auf Spaltennamen
    const autoMapping: Record<string, string> = {};
    h.forEach((header) => {
      const normalized = header.toLowerCase().trim();
      const match = knownColumnAliases[normalized];
      if (match) {
        autoMapping[header] = match;
      }
    });
    setMapping(autoMapping);
    setStep(2);
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

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
  }

  function loadTemplate(template: MappingTemplate) {
    setMapping(template.mapping);
    setDelimiter(template.delimiter);
  }

  async function handleImport() {
    setProcessing(true);
    try {
      const res = await processImport(
        fileContent,
        mapping,
        delimiter,
        templateName || undefined,
      );
      setResult(res);
      setStep(4);
    } catch {
      setResult({ error: "Import fehlgeschlagen. Bitte versuchen Sie es erneut." });
      setStep(4);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      {/* Schritt-Anzeige */}
      <div className="mb-6 flex items-center gap-2 text-sm">
        {[
          { n: 1, label: "Upload" },
          { n: 2, label: "Mapping" },
          { n: 3, label: "Überprüfen" },
          { n: 4, label: "Ergebnis" },
        ].map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            {i > 0 && <div className="h-px w-8 bg-gray-300 dark:bg-gray-700" />}
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                step >= s.n
                  ? "bg-primary text-gray-900"
                  : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
              }`}
            >
              {step > s.n ? <Check className="h-3.5 w-3.5" /> : s.n}
            </div>
            <span className={step >= s.n ? "font-medium" : "text-gray-500 dark:text-gray-400"}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Schritt 1: Upload */}
      {step === 1 && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <label className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition ${
            dragging
              ? "border-primary bg-blue-50 dark:bg-primary/10"
              : "border-gray-300 hover:border-primary hover:bg-blue-50/50 dark:border-gray-700 dark:hover:bg-primary/5"
          }`}>
            <Upload className={`h-10 w-10 ${dragging ? "text-primary" : "text-gray-400"}`} />
            <p className="mt-2 text-sm font-medium">
              CSV-Datei auswählen oder hierher ziehen
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Komma, Semikolon oder Tab als Trennzeichen
            </p>
            <input
              type="file"
              accept=".csv,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
      )}

      {/* Schritt 2: Mapping */}
      {step === 2 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-medium">Spalten-Zuordnung</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {fileName} — {headers.length} Spalten, Trennzeichen: {delimiter === ";" ? "Semikolon" : delimiter === "\t" ? "Tab" : "Komma"}
              </p>
            </div>
            {templates.length > 0 && (
              <select
                onChange={(e) => {
                  const t = templates.find((t) => t.id === e.target.value);
                  if (t) loadTemplate(t);
                }}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                defaultValue=""
              >
                <option value="" disabled>
                  Template laden…
                </option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-2">
            {headers.map((header) => (
              <div
                key={header}
                className="flex items-center gap-4 rounded-md border border-gray-100 px-3 py-2 dark:border-[#2c2c2e]"
              >
                <span className="w-1/3 text-sm font-medium">{header}</span>
                <ArrowRight className="h-4 w-4 text-gray-400" />
                <select
                  value={mapping[header] ?? ""}
                  onChange={(e) =>
                    setMapping((prev) => ({
                      ...prev,
                      [header]: e.target.value,
                    }))
                  }
                  className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                >
                  <option value="">— Nicht zuordnen —</option>
                  {leadFields.map((field) => (
                    <option key={field.key} value={field.key}>
                      {field.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              <ArrowLeft className="h-4 w-4" />
              Zurück
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!mapping.company_name && !Object.values(mapping).includes("company_name")}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-gray-900 hover:bg-primary-dark disabled:opacity-50"
            >
              Weiter
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Schritt 3: Überprüfen */}
      {step === 3 && (
        <div>
          <h3 className="font-medium">Vorschau (erste 10 Zeilen)</h3>
          <div className="mt-3 overflow-x-auto rounded-md border border-gray-200 dark:border-[#2c2c2e]">
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-[#2c2c2e]">
              <thead className="bg-gray-50 dark:bg-[#232325]">
                <tr>
                  {Object.entries(mapping)
                    .filter(([, v]) => v)
                    .map(([csvCol, leadField]) => (
                      <th key={csvCol} className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                        {leadFields.find((f) => f.key === leadField)?.label ?? leadField}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-[#2c2c2e]">
                {previewRows.map((row, i) => (
                  <tr key={i}>
                    {Object.entries(mapping)
                      .filter(([, v]) => v)
                      .map(([csvCol]) => {
                        const colIndex = headers.indexOf(csvCol);
                        return (
                          <td key={csvCol} className="whitespace-nowrap px-3 py-2 text-gray-700 dark:text-gray-300">
                            {row[colIndex] ?? "–"}
                          </td>
                        );
                      })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Mapping als Template speichern (optional)
            </label>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="z.B. NorthData-Format"
              className="mt-1 w-64 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            />
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              <ArrowLeft className="h-4 w-4" />
              Zurück
            </button>
            <button
              onClick={handleImport}
              disabled={processing}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-gray-900 hover:bg-primary-dark disabled:opacity-50"
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importiere…
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Import starten
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Schritt 4: Ergebnis */}
      {step === 4 && result && (
        <div>
          {result.error ? (
            <div className="rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {result.error}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md bg-green-50 p-4 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
                Import erfolgreich abgeschlossen!
              </div>
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: "Importiert", value: result.imported },
                  { label: "Übersprungen", value: result.skipped },
                  { label: "Duplikate", value: result.duplicates },
                  { label: "Fehler", value: result.errors },
                ].map((s) => (
                  <div key={s.label} className="rounded-md border border-gray-200 p-3 text-center dark:border-[#2c2c2e]">
                    <p className="text-2xl font-bold">{s.value}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => {
              setStep(1);
              setResult(null);
              setFileContent("");
              setFileName("");
              setHeaders([]);
              setPreviewRows([]);
              setMapping({});
              setTemplateName("");
            }}
            className="mt-4 inline-flex items-center gap-1 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            Neuen Import starten
          </button>
        </div>
      )}
    </div>
  );
}
