"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles, Trash2, ShieldBan, Send, Download } from "lucide-react";
import type { Lead } from "@/lib/types";
import { bulkUpdateStatus, bulkDeleteLeads, bulkAddToBlacklist, saveColumnPreferences } from "./actions";
import { useToastContext } from "../toast-provider";
import { useServiceMode } from "@/lib/service-mode";
import { SearchBox } from "@/components/table/search-box";
import { TablePagination } from "@/components/table/pagination";
import { ColumnPicker } from "@/components/table/column-picker";
import { SortableHeader } from "@/components/table/sortable-header";

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
  { key: "company_name", label: "Firma", defaultVisible: true, modes: ["recruiting", "webdev"] },
  { key: "domain", label: "Domain", defaultVisible: true, modes: ["recruiting", "webdev"] },
  { key: "city", label: "Ort", defaultVisible: true, modes: ["recruiting", "webdev"] },
  { key: "zip", label: "PLZ", defaultVisible: false, modes: ["recruiting", "webdev"] },
  { key: "industry", label: "Branche", defaultVisible: true, modes: ["recruiting"] },
  { key: "company_size", label: "Größe", defaultVisible: false, modes: ["recruiting", "webdev"] },
  { key: "legal_form", label: "Rechtsform", defaultVisible: false, modes: ["recruiting"] },
  { key: "phone", label: "Telefon", defaultVisible: false, modes: ["recruiting", "webdev"] },
  { key: "email", label: "E-Mail", defaultVisible: false, modes: ["recruiting", "webdev"] },
  { key: "has_ssl", label: "SSL", defaultVisible: true, modes: ["webdev"] },
  { key: "is_mobile_friendly", label: "Mobil", defaultVisible: true, modes: ["webdev"] },
  { key: "website_tech", label: "Technik", defaultVisible: true, modes: ["webdev"] },
  { key: "website_age_estimate", label: "Design", defaultVisible: true, modes: ["webdev"] },
  { key: "source_type", label: "Quelle", defaultVisible: false, modes: ["recruiting", "webdev"] },
  { key: "status", label: "Status", defaultVisible: true, modes: ["recruiting", "webdev"] },
  { key: "updated_at", label: "Bearbeitet", defaultVisible: true, modes: ["recruiting", "webdev"] },
  { key: "created_at", label: "Erstellt", defaultVisible: false, modes: ["recruiting", "webdev"] },
];

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
  const { addToast } = useToastContext();
  const { mode: serviceMode } = useServiceMode();

  const modeColumns = ALL_COLUMNS.filter((c) => c.modes.includes(serviceMode));
  const defaultVisible = modeColumns.filter((c) => c.defaultVisible).map((c) => c.key);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [bulkStatus, setBulkStatus] = useState("qualified");
  const [bulkPending, startBulkTransition] = useTransition();
  const [visibleCols, setVisibleCols] = useState<string[]>(savedColumns ?? defaultVisible);

  const columns = modeColumns.filter((c) => visibleCols.includes(c.key));

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
        addToast(`Fehler: ${res.error}`, "error");
      } else {
        addToast(`${ids.length} Lead(s) auf "${statusLabels[bulkStatus]?.label ?? bulkStatus}" gesetzt`);
        setSelected(new Set());
        router.refresh();
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

  function handleColumnFilter(col: string, value: string) {
    updateParams({ [`filter_${col}`]: value, page: "1" });
  }

  function getCellValue(lead: Lead, key: string): string {
    if (key === "created_at") return new Date(lead.created_at).toLocaleDateString("de-DE");
    if (key === "updated_at") return new Date(lead.updated_at).toLocaleDateString("de-DE");
    if (key === "status") return statusLabels[lead.status]?.label ?? lead.status;
    if (key === "source_type") {
      const labels: Record<string, string> = { csv: "CSV", url: "URL", directory: "Verzeichnis" };
      return labels[lead.source_type] ?? lead.source_type;
    }
    if (key === "has_ssl") return lead.has_ssl == null ? "–" : lead.has_ssl ? "Ja" : "Nein";
    if (key === "is_mobile_friendly") return lead.is_mobile_friendly == null ? "–" : lead.is_mobile_friendly ? "Ja" : "Nein";
    if (key === "website_age_estimate") {
      const labels: Record<string, string> = { veraltet: "Veraltet", durchschnittlich: "OK", modern: "Modern" };
      return labels[lead.website_age_estimate ?? ""] ?? lead.website_age_estimate ?? "–";
    }
    const val = lead[key as keyof Lead];
    if (val == null) return "–";
    return String(val);
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Suche, Filter & Spalten */}
      <div className="flex items-center gap-3">
        <SearchBox
          defaultValue={currentQuery}
          placeholder="Suche nach Firmenname, Domain oder Ort…"
          onSubmit={(v) => updateParams({ q: v, page: "1" })}
        />

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

        <ColumnPicker
          columns={modeColumns.map((c) => ({ key: c.key, label: c.label }))}
          visible={visibleCols}
          onToggle={toggleColumn}
        />
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
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
          <span className="text-sm font-bold text-primary">{selected.size}</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">ausgewählt</span>
          <div className="h-4 w-px bg-gray-200 dark:bg-[#2c2c2e]" />

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

          <div className="h-4 w-px bg-gray-200 dark:bg-[#2c2c2e]" />

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
            disabled={bulkPending}
            onClick={() => {
              const ids = Array.from(selected);
              const count = ids.length;
              const defaultCrmId = serviceMode === "webdev"
                ? "webdesign-manuelle-ueberpruefung"
                : "recruiting-manuelle-ueberpruefung";
              startBulkTransition(async () => {
                const res = await bulkUpdateStatus(ids, "qualified", defaultCrmId);
                if (res.error) {
                  addToast(`Fehler: ${res.error}`, "error");
                  return;
                }
                addToast(`${count} Lead${count === 1 ? "" : "s"} ins CRM verschoben`);
                setSelected(new Set());
                router.push("/crm");
              });
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <Send className="h-3.5 w-3.5" />
            Ins CRM
          </button>
          <button
            onClick={() => {
              if (confirm(`${selected.size} Lead(s) auf die Blacklist setzen?`)) {
                const count = selected.size;
                startBulkTransition(async () => {
                  await bulkAddToBlacklist(Array.from(selected));
                  addToast(`${count} Lead(s) auf Blacklist gesetzt`);
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
              if (confirm(`${selected.size} Lead(s) in den Papierkorb verschieben? Du kannst sie 30 Tage lang unter Einstellungen → Papierkorb wiederherstellen.`)) {
                const count = selected.size;
                startBulkTransition(async () => {
                  const res = await bulkDeleteLeads(Array.from(selected));
                  if (res.error) {
                    addToast(`Fehler: ${res.error}`, "error");
                  } else {
                    addToast(
                      `${count} Lead${count === 1 ? "" : "s"} im Papierkorb — 30 Tage wiederherstellbar.`,
                      "success",
                      { action: { label: "Papierkorb öffnen", href: "/einstellungen/papierkorb" } },
                    );
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
          <div className="h-4 w-px bg-gray-300 dark:bg-[#2c2c2e]" />
          <button
            onClick={() => setSelected(new Set())}
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Abbrechen
          </button>
        </div>
      )}


      {/* Tabelle */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-[#2c2c2e]">
          <thead className="bg-gray-50 dark:bg-[#232325]">
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
                <SortableHeader
                  key={col.key}
                  label={col.label}
                  sortKey={col.key}
                  currentSort={currentSort}
                  currentOrder={currentOrder}
                  onSort={handleSort}
                  filterable={!["created_at", "status"].includes(col.key)}
                  currentFilter={currentFilters[col.key] ?? ""}
                  onFilter={handleColumnFilter}
                />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-[#2c2c2e]">
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
                        onClick={() => {
                          const qs = searchParams.toString();
                          const from = qs ? `?from=${encodeURIComponent(qs)}` : "";
                          router.push(`/leads/${lead.id}${from}`);
                        }}
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
                        ) : col.key === "domain" && lead.domain ? (
                          <a
                            href={`https://${lead.domain}`}
                            target="_blank"
                            rel="noreferrer noopener"
                            onClick={(e) => e.stopPropagation()}
                            className="text-primary hover:underline"
                          >
                            {lead.domain}
                          </a>
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

      <TablePagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(p) => updateParams({ page: String(p) })}
      />
    </div>
  );
}
