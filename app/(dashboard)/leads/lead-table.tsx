"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, ChevronLeft, ChevronRight, Columns3, Sparkles, Filter, Trash2, ShieldBan, Send, Download } from "lucide-react";
import type { Lead } from "@/lib/types";
import { bulkUpdateStatus, bulkDeleteLeads, bulkAddToBlacklist, saveColumnPreferences } from "./actions";

const statusLabels: Record<string, { label: string; color: string }> = {
  imported: { label: "Importiert", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  filtered: { label: "Gefiltert", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  cancelled: { label: "Ausgeschlossen", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  enrichment_pending: { label: "Anreicherung", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  enriched: { label: "Angereichert", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  qualified: { label: "Qualifiziert", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  exported: { label: "Exportiert", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
};

const ALL_COLUMNS = [
  { key: "company_name", label: "Firma", defaultVisible: true },
  { key: "domain", label: "Domain", defaultVisible: false },
  { key: "city", label: "Ort", defaultVisible: true },
  { key: "zip", label: "PLZ", defaultVisible: false },
  { key: "industry", label: "Branche", defaultVisible: true },
  { key: "company_size", label: "Größe", defaultVisible: false },
  { key: "legal_form", label: "Rechtsform", defaultVisible: false },
  { key: "phone", label: "Telefon", defaultVisible: false },
  { key: "email", label: "E-Mail", defaultVisible: false },
  { key: "source_type", label: "Quelle", defaultVisible: false },
  { key: "status", label: "Status", defaultVisible: true },
  { key: "updated_at", label: "Bearbeitet", defaultVisible: true },
  { key: "created_at", label: "Erstellt", defaultVisible: false },
];

const DEFAULT_VISIBLE = ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key);

interface Props {
  leads: Lead[];
  totalPages: number;
  currentPage: number;
  currentSort: string;
  currentOrder: string;
  currentQuery: string;
  currentStatus: string;
  currentFilters: Record<string, string>;
  visibleColumns: string[] | null;
  onOpenEnrichModal?: (ids: string[]) => void;
}

export function LeadTable({
  leads,
  totalPages,
  currentPage,
  currentSort,
  currentOrder,
  currentQuery,
  currentStatus,
  currentFilters,
  visibleColumns: savedColumns,
  onOpenEnrichModal,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [bulkStatus, setBulkStatus] = useState("qualified");
  const [bulkPending, startBulkTransition] = useTransition();
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [visibleCols, setVisibleCols] = useState<string[]>(savedColumns ?? DEFAULT_VISIBLE);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const columnPickerRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (columnPickerRef.current && !columnPickerRef.current.contains(e.target as Node)) {
        setShowColumnPicker(false);
      }
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setActiveFilter(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const columns = ALL_COLUMNS.filter((c) => visibleCols.includes(c.key));

  function toggleColumn(key: string) {
    const next = visibleCols.includes(key)
      ? visibleCols.filter((k) => k !== key)
      : [...visibleCols, key];
    setVisibleCols(next);
    saveColumnPreferences(next);
  }

  function toggleAll() {
    if (selected.size === leads.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(leads.map((l) => l.id)));
    }
  }

  function toggleOne(id: string, index: number, e?: React.MouseEvent) {
    const next = new Set(selected);

    // Shift+Klick: Bereich auswählen
    if (e?.shiftKey && lastClickedIndex !== null) {
      const start = Math.min(lastClickedIndex, index);
      const end = Math.max(lastClickedIndex, index);
      for (let i = start; i <= end; i++) {
        next.add(leads[i].id);
      }
      setSelected(next);
      setLastClickedIndex(index);
      return;
    }

    // Cmd/Ctrl+Klick oder normaler Klick: Einzeln togglen
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    setLastClickedIndex(index);
  }

  function handleBulkUpdate() {
    const ids = Array.from(selected);
    startBulkTransition(async () => {
      const res = await bulkUpdateStatus(ids, bulkStatus);
      if (res.error) {
        setBulkResult(`Fehler: ${res.error}`);
      } else {
        setBulkResult(`${ids.length} Lead(s) auf "${statusLabels[bulkStatus]?.label ?? bulkStatus}" gesetzt.`);
        setSelected(new Set());
      }
    });
  }

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });
    router.push(`/leads?${params.toString()}`);
  }

  function handleSort(field: string) {
    const newOrder =
      currentSort === field && currentOrder === "asc" ? "desc" : "asc";
    updateParams({ sort: field, order: newOrder, page: "1" });
  }

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const q = formData.get("q") as string;
    updateParams({ q, page: "1" });
  }

  function handleColumnFilter(col: string, value: string) {
    updateParams({ [`filter_${col}`]: value, page: "1" });
    setActiveFilter(null);
  }

  function getCellValue(lead: Lead, key: string): string {
    if (key === "created_at") return new Date(lead.created_at).toLocaleDateString("de-DE");
    if (key === "updated_at") return new Date(lead.updated_at).toLocaleDateString("de-DE");
    if (key === "status") return statusLabels[lead.status]?.label ?? lead.status;
    if (key === "source_type") {
      const labels: Record<string, string> = { csv: "CSV", url: "URL", directory: "Verzeichnis" };
      return labels[lead.source_type] ?? lead.source_type;
    }
    const val = lead[key as keyof Lead];
    if (val == null) return "–";
    return String(val);
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Suche, Filter & Spalten */}
      <div className="flex items-center gap-3">
        <form onSubmit={handleSearch} className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              name="q"
              type="text"
              defaultValue={currentQuery}
              placeholder="Suche nach Firmenname, Domain oder Ort…"
              className="w-full rounded-md border border-gray-300 py-2 pl-10 pr-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            />
          </div>
        </form>

        <select
          value={currentStatus}
          onChange={(e) => updateParams({ status: e.target.value, page: "1" })}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="">Alle Status</option>
          {Object.entries(statusLabels).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        {/* Spalten-Picker */}
        <div className="relative" ref={columnPickerRef}>
          <button
            onClick={() => setShowColumnPicker(!showColumnPicker)}
            className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            <Columns3 className="h-4 w-4" />
            Spalten
          </button>
          {showColumnPicker && (
            <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-800">
              {ALL_COLUMNS.map((col) => (
                <label key={col.key} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
                  <input
                    type="checkbox"
                    checked={visibleCols.includes(col.key)}
                    onChange={() => toggleColumn(col.key)}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  {col.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Aktive Spalten-Filter anzeigen */}
      {Object.keys(currentFilters).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(currentFilters).map(([key, value]) => {
            const col = ALL_COLUMNS.find((c) => c.key === key);
            return (
              <span
                key={key}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
              >
                {col?.label ?? key}: {value}
                <button
                  onClick={() => updateParams({ [`filter_${key}`]: "", page: "1" })}
                  className="ml-1 hover:text-primary-dark"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Bulk-Aktionen */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-[#111827]">
          <span className="text-sm font-bold text-primary">{selected.size}</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">ausgewählt</span>
          <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />

          {/* Primäre Aktionen */}
          {onOpenEnrichModal && (
            <button
              onClick={() => onOpenEnrichModal(Array.from(selected))}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Anreichern
            </button>
          )}

          {/* Status */}
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          >
            {Object.entries(statusLabels).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <button
            onClick={handleBulkUpdate}
            disabled={bulkPending}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            {bulkPending ? "…" : "Setzen"}
          </button>

          <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />

          {/* Sekundäre Aktionen — einheitliches Styling */}
          <button
            onClick={() => {
              const ids = Array.from(selected).join(",");
              window.open(`/api/export-csv?ids=${ids}`, "_blank");
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
          <button
            onClick={() => router.push("/export")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <Send className="h-3.5 w-3.5" />
            HubSpot
          </button>
          <button
            onClick={() => {
              if (confirm(`${selected.size} Lead(s) auf die Blacklist setzen?`)) {
                startBulkTransition(async () => {
                  await bulkAddToBlacklist(Array.from(selected));
                  setBulkResult(`${selected.size} Lead(s) auf Blacklist gesetzt.`);
                  setSelected(new Set());
                });
              }
            }}
            disabled={bulkPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <ShieldBan className="h-3.5 w-3.5" />
            Blacklist
          </button>
          <button
            onClick={() => {
              if (confirm(`${selected.size} Lead(s) endgültig löschen?`)) {
                startBulkTransition(async () => {
                  const res = await bulkDeleteLeads(Array.from(selected));
                  if (res.error) {
                    setBulkResult(`Fehler: ${res.error}`);
                  } else {
                    setBulkResult(`${selected.size} Lead(s) gelöscht.`);
                    setSelected(new Set());
                  }
                });
              }
            }}
            disabled={bulkPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:border-gray-700 dark:hover:bg-red-900/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Löschen
          </button>
          <div className="h-4 w-px bg-gray-300 dark:bg-gray-700" />
          <button
            onClick={() => setSelected(new Set())}
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Abbrechen
          </button>
        </div>
      )}

      {bulkResult && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
          {bulkResult}
        </div>
      )}

      {/* Tabelle */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-800/50">
            <tr>
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selected.size === leads.length && leads.length > 0}
                  onChange={toggleAll}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="relative px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
                >
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleSort(col.key)}
                      className="hover:text-gray-700 dark:hover:text-gray-200"
                    >
                      {col.label}
                      {currentSort === col.key && (
                        <span className="ml-1">{currentOrder === "asc" ? "↑" : "↓"}</span>
                      )}
                    </button>
                    {/* Spalten-Filter (nur für Textfelder) */}
                    {!["created_at", "status"].includes(col.key) && (
                      <div className="relative" ref={activeFilter === col.key ? filterRef : undefined}>
                        <button
                          onClick={() => setActiveFilter(activeFilter === col.key ? null : col.key)}
                          className={`ml-0.5 rounded p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 ${
                            currentFilters[col.key] ? "text-primary" : "text-gray-400"
                          }`}
                        >
                          <Filter className="h-3 w-3" />
                        </button>
                        {activeFilter === col.key && (
                          <div className="absolute left-0 z-20 mt-1 w-48 rounded-md border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                const fd = new FormData(e.currentTarget);
                                handleColumnFilter(col.key, fd.get("value") as string);
                              }}
                            >
                              <input
                                name="value"
                                type="text"
                                defaultValue={currentFilters[col.key] ?? ""}
                                placeholder={`${col.label} enthält…`}
                                autoFocus
                                className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                              />
                              <div className="mt-1.5 flex gap-1">
                                <button
                                  type="submit"
                                  className="rounded bg-primary px-2 py-0.5 text-xs text-white hover:bg-primary-dark"
                                >
                                  Filtern
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleColumnFilter(col.key, "")}
                                  className="rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                                >
                                  Löschen
                                </button>
                              </div>
                            </form>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {leads.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  Keine Leads gefunden.
                </td>
              </tr>
            ) : (
              leads.map((lead, leadIndex) => {
                const status = statusLabels[lead.status] ?? {
                  label: lead.status,
                  color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
                };
                return (
                  <tr
                    key={lead.id}
                    className={`cursor-pointer transition ${selected.has(lead.id) ? "bg-primary/5 dark:bg-primary/10" : "hover:bg-gray-50 dark:hover:bg-gray-800/50"}`}
                  >
                    <td className="px-4 py-3" onClick={(e) => { e.stopPropagation(); toggleOne(lead.id, leadIndex, e); }}>
                      <input
                        type="checkbox"
                        checked={selected.has(lead.id)}
                        onChange={() => {}} // handled by td onClick
                        className="rounded border-gray-300 dark:border-gray-600"
                      />
                    </td>
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        onClick={() => router.push(`/leads/${lead.id}`)}
                        className={`whitespace-nowrap px-4 py-3 text-sm ${
                          col.key === "company_name"
                            ? "font-medium"
                            : col.key === "status"
                              ? ""
                              : "text-gray-600 dark:text-gray-400"
                        }`}
                      >
                        {col.key === "status" ? (
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${status.color}`}
                            title={lead.cancel_reason ?? lead.blacklist_reason ?? undefined}
                          >
                            {status.label}
                          </span>
                        ) : (
                          getCellValue(lead, col.key)
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Seite {currentPage} von {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              disabled={currentPage <= 1}
              onClick={() => updateParams({ page: String(currentPage - 1) })}
              className="inline-flex items-center rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => updateParams({ page: String(currentPage + 1) })}
              className="inline-flex items-center rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
