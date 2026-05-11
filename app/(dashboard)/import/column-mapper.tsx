"use client";

import { useMemo } from "react";

export interface MapperTarget {
  key: string;
  label: string;
  /** Pflichtfeld → wenn nicht gemappt, ist Submit blockiert. */
  required?: boolean;
  /** Optionaler Hint-Text unter dem Label. */
  hint?: string;
}

interface Props {
  /** Logische Felder, die belegt werden sollen (z.B. "Telefon", "Website"). */
  targets: MapperTarget[];
  /** CSV-Header. */
  headers: string[];
  /** Aktuelles Mapping: targetKey → headerName ("" = nicht zuordnen). */
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  /** Ein paar Beispielzeilen für die Live-Preview. */
  rows: string[][];
}

export function ColumnMapper({ targets, headers, value, onChange, rows }: Props) {
  // Pro Header: bis zu 2 nicht-leere Beispielwerte als kompakte Vorschau für
  // das Dropdown. Hilft beim Mappen, weil viele Scraper-Header kryptisch sind
  // (z.B. "W4Efsd 4" sagt nichts; "Borsigstr. 2 • Carl-Zeiss-Str. 2" zeigt sofort
  // dass das die Adress-Spalte ist).
  const headerSamples = useMemo(() => {
    const out = new Map<string, string>();
    headers.forEach((h, i) => {
      const samples: string[] = [];
      for (const r of rows) {
        const v = r[i];
        if (!v) continue;
        const cleaned = v.replace(/\s+/g, " ").trim();
        if (!cleaned || cleaned === "·") continue;
        if (samples.includes(cleaned)) continue;
        samples.push(cleaned.length > 30 ? cleaned.slice(0, 29) + "…" : cleaned);
        if (samples.length >= 2) break;
      }
      out.set(h, samples.join(" • "));
    });
    return out;
  }, [headers, rows]);

  // Bereits anderswo benutzte Headers (für visuellen Hinweis)
  const usedHeaders = new Set(Object.values(value).filter(Boolean));

  function setOne(targetKey: string, header: string) {
    onChange({ ...value, [targetKey]: header });
  }

  return (
    <div className="space-y-1.5">
      {targets.map((t) => {
        const selectedHeader = value[t.key] ?? "";
        const missing = t.required && !selectedHeader;

        return (
          <div
            key={t.key}
            className={`grid grid-cols-[12rem_1fr] items-center gap-3 rounded-lg border px-3 py-2 ${
              missing
                ? "border-red-300 bg-red-50 dark:border-red-900/40 dark:bg-red-900/10"
                : "border-gray-100 dark:border-[#2c2c2e]"
            }`}
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {t.label}
                {t.required && <span className="ml-1 text-red-600">*</span>}
              </div>
              {t.hint && (
                <div className="truncate text-[11px] text-gray-500 dark:text-gray-400">{t.hint}</div>
              )}
            </div>
            <select
              value={selectedHeader}
              onChange={(e) => setOne(t.key, e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-[#1c1c1e] dark:text-gray-100"
            >
              <option value="">— Nicht zuordnen —</option>
              {headers.map((h) => {
                const used = usedHeaders.has(h) && h !== selectedHeader;
                const sample = headerSamples.get(h);
                return (
                  <option key={h} value={h}>
                    {h}
                    {used ? "  · bereits vergeben" : ""}
                    {sample ? `  —  ${sample}` : ""}
                  </option>
                );
              })}
            </select>
          </div>
        );
      })}
    </div>
  );
}
