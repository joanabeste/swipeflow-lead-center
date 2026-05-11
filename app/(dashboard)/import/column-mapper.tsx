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

function truncate(s: string | undefined | null, max: number): string {
  if (!s) return "–";
  const clean = s.replace(/\s+/g, " ").trim();
  if (clean.length === 0) return "–";
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}

export function ColumnMapper({ targets, headers, value, onChange, rows }: Props) {
  // Header → Index, einmalig berechnet
  const headerIndex = useMemo(() => {
    const m = new Map<string, number>();
    headers.forEach((h, i) => m.set(h, i));
    return m;
  }, [headers]);

  // Bereits anderswo benutzte Headers (für visuellen Hinweis)
  const usedHeaders = new Set(Object.values(value).filter(Boolean));

  function setOne(targetKey: string, header: string) {
    onChange({ ...value, [targetKey]: header });
  }

  return (
    <div className="space-y-2">
      {targets.map((t) => {
        const selectedHeader = value[t.key] ?? "";
        const idx = selectedHeader ? headerIndex.get(selectedHeader) ?? -1 : -1;
        const samples = idx >= 0
          ? rows.slice(0, 3).map((r) => r[idx] ?? "").filter((v) => v && v.trim())
          : [];
        const missing = t.required && !selectedHeader;

        return (
          <div
            key={t.key}
            className={`flex flex-col gap-2 rounded-lg border px-3 py-2.5 sm:flex-row sm:items-center ${
              missing
                ? "border-red-300 bg-red-50 dark:border-red-900/40 dark:bg-red-900/10"
                : "border-gray-100 dark:border-[#2c2c2e]"
            }`}
          >
            <div className="sm:w-1/3">
              <div className="text-sm font-medium">
                {t.label}
                {t.required && <span className="ml-1 text-red-600">*</span>}
              </div>
              {t.hint && (
                <div className="text-[11px] text-gray-500 dark:text-gray-400">{t.hint}</div>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
              <select
                value={selectedHeader}
                onChange={(e) => setOne(t.key, e.target.value)}
                className="flex-1 rounded-md border border-gray-200 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-[#1c1c1e] dark:text-gray-100"
              >
                <option value="">— Nicht zuordnen —</option>
                {headers.map((h) => {
                  const used = usedHeaders.has(h) && h !== selectedHeader;
                  return (
                    <option key={h} value={h}>
                      {h}
                      {used ? "  · bereits vergeben" : ""}
                    </option>
                  );
                })}
              </select>
              <div className="min-w-0 flex-1 truncate text-xs text-gray-500 dark:text-gray-400">
                {samples.length > 0
                  ? samples.map((s) => truncate(s, 30)).join("  •  ")
                  : selectedHeader
                    ? "(keine Beispielwerte)"
                    : ""}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
