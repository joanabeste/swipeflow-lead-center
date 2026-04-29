"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Trash2, StickyNote, MessageSquare, Plus, CircleX } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import type { CustomLeadStatus } from "@/lib/types";
import type { ColumnPref } from "@/lib/table-prefs";
import { updateCrmStatus } from "./actions";
import { bulkDeleteLeads, bulkArchiveLeads, bulkRestoreCrmStatus } from "../leads/actions";
import { useServiceMode } from "@/lib/service-mode";
import { InlineStatusDropdown } from "./_components/inline-status-dropdown";
import { NewLeadModal } from "./new-lead-modal";
import { useToastContext } from "../toast-provider";
import { SearchBox } from "@/components/table/search-box";
import { TablePagination } from "@/components/table/pagination";
import { ColumnPicker } from "@/components/table/column-picker";
import { DraggableResizableHeader } from "@/components/table/draggable-resizable-header";
import { useColumnLayout } from "@/components/table/use-column-layout";
import { PhoneCallLink } from "@/components/phone-call-link";

export interface CrmLead {
  id: string;
  company_name: string;
  domain: string | null;
  city: string | null;
  zip: string | null;
  industry: string | null;
  company_size: string | null;
  phone: string | null;
  email: string | null;
  crm_status_id: string | null;
  updated_at: string;
  created_at: string;
  call_count: number;
  last_call_at: string | null;
  note_count: number;
}

const ALL_COLUMNS: { key: string; label: string; defaultVisible: boolean; filterable?: boolean }[] = [
  { key: "company_name", label: "Firma", defaultVisible: true, filterable: true },
  { key: "domain", label: "Domain", defaultVisible: true, filterable: true },
  { key: "city", label: "Ort", defaultVisible: true, filterable: true },
  { key: "zip", label: "PLZ", defaultVisible: false, filterable: true },
  { key: "industry", label: "Branche", defaultVisible: true, filterable: true },
  { key: "company_size", label: "Größe", defaultVisible: false, filterable: true },
  { key: "phone", label: "Telefon", defaultVisible: true, filterable: true },
  { key: "email", label: "E-Mail", defaultVisible: false, filterable: true },
  { key: "crm_status_id", label: "CRM-Status", defaultVisible: true },
  { key: "call_count", label: "Anrufe", defaultVisible: true },
  { key: "note_count", label: "Notizen", defaultVisible: true },
  { key: "last_call_at", label: "Letzter Anruf", defaultVisible: true },
  { key: "updated_at", label: "Bearbeitet", defaultVisible: false },
  { key: "created_at", label: "Erstellt", defaultVisible: false },
];

interface Props {
  leads: CrmLead[];
  statuses: CustomLeadStatus[];
  totalPages: number;
  currentPage: number;
  currentSort: string;
  currentOrder: string;
  currentQuery: string;
  currentStatus: string;
  currentActivity: string;
  currentLastCall: string;
  currentFilters: Record<string, string>;
  initialColumnPrefs: ColumnPref[];
}

export function CrmManager({
  leads, statuses, totalPages, currentPage, currentSort, currentOrder,
  currentQuery, currentStatus, currentActivity, currentLastCall, currentFilters,
  initialColumnPrefs,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToast } = useToastContext();
  const { mode: serviceMode } = useServiceMode();
  const activeStatuses = statuses.filter((s) => s.is_active);

  const { visible, widthOf, totalVisibleWidth, reorder, setWidth, toggleVisibility, reset } = useColumnLayout({
    tableKey: "crm",
    allColumns: ALL_COLUMNS,
    initialPrefs: initialColumnPrefs,
  });
  // 48px = Checkbox-Spalte; addieren, damit horizontaler Scroll greift,
  // sobald die Spalten zusammen breiter als der Container werden.
  const tableWidth = totalVisibleWidth + 48;
  const visibleKeys = visible.map((v) => v.col.key);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastIndex, setLastIndex] = useState<number | null>(null);
  const [bulkStatus, setBulkStatus] = useState<string>(activeStatuses[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [showNewLead, setShowNewLead] = useState(false);

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    router.push(`/crm?${params.toString()}`);
  }

  function toggleAll() {
    if (selected.size === leads.length) setSelected(new Set());
    else setSelected(new Set(leads.map((l) => l.id)));
  }

  function toggleOne(id: string, index: number, e: React.MouseEvent) {
    const next = new Set(selected);
    if (e.shiftKey && lastIndex !== null) {
      const [from, to] = [Math.min(lastIndex, index), Math.max(lastIndex, index)];
      for (let i = from; i <= to; i++) next.add(leads[i].id);
    } else {
      if (next.has(id)) next.delete(id);
      else next.add(id);
    }
    setSelected(next);
    setLastIndex(index);
  }

  function handleBulkStatus() {
    if (!bulkStatus) return;
    const ids = Array.from(selected);
    startTransition(async () => {
      for (const id of ids) await updateCrmStatus(id, bulkStatus);
      addToast(`${ids.length} Lead(s) auf "${statuses.find((s) => s.id === bulkStatus)?.label}" gesetzt`);
      setSelected(new Set());
      router.refresh();
    });
  }

  function handleBulkDelete() {
    if (!confirm(`${selected.size} Firma/Firmen in den Papierkorb verschieben? Du kannst sie 30 Tage lang unter Einstellungen → Papierkorb wiederherstellen.`)) return;
    const ids = Array.from(selected);
    startTransition(async () => {
      const res = await bulkDeleteLeads(ids);
      if (res.error) addToast(`Fehler: ${res.error}`, "error");
      else {
        addToast(
          `${ids.length} ${ids.length === 1 ? "Firma" : "Firmen"} im Papierkorb — 30 Tage wiederherstellbar.`,
          "success",
          { action: { label: "Papierkorb öffnen", href: "/einstellungen/papierkorb" } },
        );
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  function handleBulkArchive() {
    const count = selected.size;
    if (!confirm(
      `${count} Lead${count === 1 ? "" : "s"} aussortieren? ` +
      `${count === 1 ? "Er erscheint" : "Sie erscheinen"} nicht mehr im CRM oder unter Neue Leads ` +
      `und ${count === 1 ? "wird" : "werden"} der KI als Negativ-Signal gemeldet.`,
    )) return;
    const ids = Array.from(selected);
    const mode = serviceMode === "webdev" ? "webdev" : "recruiting";
    startTransition(async () => {
      const res = await bulkArchiveLeads(ids, mode);
      if ("error" in res && res.error) {
        addToast(`Fehler: ${res.error}`, "error");
        return;
      }
      const previous = "previous" in res ? res.previous : [];
      addToast(
        `${count} Lead${count === 1 ? "" : "s"} aussortiert.`,
        "success",
        {
          action: {
            label: "Rückgängig",
            onClick: () => {
              startTransition(async () => {
                const undo = await bulkRestoreCrmStatus(previous);
                if ("error" in undo && undo.error) {
                  addToast(`Fehler beim Rückgängig: ${undo.error}`, "error");
                } else {
                  addToast("Aussortierung rückgängig gemacht.", "success");
                  router.refresh();
                }
              });
            },
          },
        },
      );
      setSelected(new Set());
      router.refresh();
    });
  }

  function formatDate(iso: string | null) {
    if (!iso) return "–";
    return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
  }

  const hasActiveFilter = currentStatus || currentActivity || currentLastCall || Object.keys(currentFilters).length > 0;

  return (
    <div className="mt-4 space-y-4">
      {/* Toolbar: Suche + Filter-Dropdowns + Neuer Lead + Spalten-Picker */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[240px]">
          <SearchBox
            defaultValue={currentQuery}
            placeholder="Firmenname, Domain, Ort…"
            onSubmit={(v) => updateParams({ q: v, page: "1" })}
          />
        </div>

        <FilterSelect
          label="CRM-Status"
          value={currentStatus}
          onChange={(v) => updateParams({ crm_status: v, page: "1" })}
          options={[
            { value: "", label: "Alle Status" },
            ...activeStatuses.map((s) => ({ value: s.id, label: s.label })),
          ]}
          activeColor={currentStatus ? activeStatuses.find((s) => s.id === currentStatus)?.color : undefined}
        />

        <FilterSelect
          label="Aktivität"
          value={currentActivity}
          onChange={(v) => updateParams({ activity: v, page: "1" })}
          options={[
            { value: "", label: "Alle" },
            { value: "called", label: "Mit Anrufen" },
            { value: "uncalled", label: "Ohne Anrufe" },
            { value: "noted", label: "Mit Notizen" },
            { value: "unnoted", label: "Ohne Notizen" },
          ]}
        />

        <FilterSelect
          label="Letzter Anruf"
          value={currentLastCall}
          onChange={(v) => updateParams({ last_call: v, page: "1" })}
          options={[
            { value: "", label: "Egal" },
            { value: "today", label: "Heute" },
            { value: "7d", label: "Letzte 7 Tage" },
            { value: "30d", label: "Letzte 30 Tage" },
            { value: "older_30d", label: "Älter als 30 Tage" },
            { value: "never", label: "Nie angerufen" },
          ]}
        />

        {hasActiveFilter && (
          <button
            onClick={() => {
              router.push("/crm");
            }}
            className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Zurücksetzen
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowNewLead(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-gray-900 hover:bg-primary-dark"
          >
            <Plus className="h-4 w-4" />
            Neuer Lead
          </button>
          <ColumnPicker
            columns={ALL_COLUMNS}
            visible={visibleKeys}
            onToggle={toggleVisibility}
            onReset={reset}
          />
        </div>
      </div>

      {showNewLead && (
        <NewLeadModal statuses={statuses} onClose={() => setShowNewLead(false)} />
      )}

      {/* Aktive Spalten-Filter */}
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

          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          >
            {activeStatuses.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <button
            onClick={handleBulkStatus}
            disabled={pending}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            Status setzen
          </button>

          <div className="h-4 w-px bg-gray-200 dark:bg-[#2c2c2e]" />

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
            onClick={handleBulkDelete}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:border-gray-700 dark:hover:bg-red-900/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Löschen
          </button>
          <button
            onClick={handleBulkArchive}
            disabled={pending}
            title="Lead(s) aussortieren — erscheinen nicht mehr im CRM oder unter Neue Leads"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-orange-600 hover:bg-orange-50 disabled:opacity-50 dark:border-gray-700 dark:text-orange-400 dark:hover:bg-orange-900/10"
          >
            <CircleX className="h-3.5 w-3.5" />
            Aussortieren
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
        <DndContext
          sensors={dndSensors}
          collisionDetection={closestCenter}
          onDragEnd={(e) => {
            if (e.over && e.active.id !== e.over.id) {
              reorder(String(e.active.id), String(e.over.id));
            }
          }}
        >
          <table
            className="w-full table-fixed divide-y divide-gray-200 dark:divide-[#2c2c2e]"
            style={{ minWidth: tableWidth }}
          >
            <colgroup>
              <col style={{ width: 48 }} />
              {visible.map((r) => (
                <col
                  key={r.col.key}
                  data-col-key={r.col.key}
                  style={{ width: widthOf(r) }}
                />
              ))}
            </colgroup>
            <thead className="bg-gray-50 dark:bg-[#232325]">
              <tr>
                <th className="border-r border-gray-200 px-4 py-3 dark:border-[#2c2c2e]">
                  <input
                    type="checkbox"
                    checked={selected.size === leads.length && leads.length > 0}
                    onChange={toggleAll}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                </th>
                <SortableContext items={visibleKeys} strategy={horizontalListSortingStrategy}>
                  {visible.map(({ col }) => (
                    <DraggableResizableHeader
                      key={col.key}
                      columnKey={col.key}
                      label={col.label}
                      currentSort={currentSort}
                      currentOrder={currentOrder}
                      onSort={(key) =>
                        updateParams({
                          sort: key,
                          order: currentSort === key && currentOrder === "asc" ? "desc" : "asc",
                          page: "1",
                        })
                      }
                      filterable={col.filterable}
                      currentFilter={currentFilters[col.key] ?? ""}
                      onFilter={(k, v) => updateParams({ [`filter_${k}`]: v, page: "1" })}
                      onResize={setWidth}
                    />
                  ))}
                </SortableContext>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-[#2c2c2e]">
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={visible.length + 1} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    Keine Leads in der Pipeline.
                  </td>
                </tr>
              ) : (
                leads.map((lead, i) => (
                  <tr
                    key={lead.id}
                    className={`cursor-pointer transition ${
                      selected.has(lead.id) ? "bg-primary/5 dark:bg-primary/10" : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    }`}
                  >
                    <td
                      className="px-4 py-3"
                      onClick={(e) => { e.stopPropagation(); toggleOne(lead.id, i, e); }}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(lead.id)}
                        onChange={() => {}}
                        className="rounded border-gray-300 dark:border-gray-600"
                      />
                    </td>
                    {visible.map(({ col }) => (
                      <td
                        key={col.key}
                        onClick={() => {
                          const qs = searchParams.toString();
                          const from = qs ? `?from=${encodeURIComponent(qs)}` : "";
                          router.push(`/crm/${lead.id}${from}`);
                        }}
                        className={`overflow-hidden text-ellipsis whitespace-nowrap px-4 py-3 text-sm ${
                          col.key === "company_name" ? "font-medium" : "text-gray-600 dark:text-gray-400"
                        }`}
                      >
                        <CellRenderer lead={lead} colKey={col.key} statuses={statuses} formatDate={formatDate} />
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </DndContext>
      </div>

      <TablePagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(p) => updateParams({ page: String(p) })}
      />
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options, activeColor,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  activeColor?: string;
}) {
  const isActive = value !== "";
  return (
    <label className="relative inline-flex items-center">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-md border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm hover:bg-gray-50 dark:border-[#2c2c2e] dark:bg-[#1c1c1e] dark:text-gray-100 dark:hover:bg-white/5"
        style={
          isActive && activeColor
            ? { borderColor: activeColor, color: activeColor, backgroundColor: `${activeColor}10` }
            : undefined
        }
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.value === "" ? label : opt.label}
          </option>
        ))}
      </select>
      <svg className="pointer-events-none absolute right-2 h-3 w-3 text-gray-400" viewBox="0 0 12 12" fill="currentColor">
        <path d="M6 8L2 4h8z" />
      </svg>
    </label>
  );
}

function CellRenderer({
  lead, colKey, statuses, formatDate,
}: {
  lead: CrmLead;
  colKey: string;
  statuses: CustomLeadStatus[];
  formatDate: (iso: string | null) => string;
}) {
  switch (colKey) {
    case "company_name":
      return <span>{lead.company_name}</span>;
    case "phone":
      return lead.phone ? (
        <PhoneCallLink
          phone={lead.phone}
          leadId={lead.id}
          className="inline-flex items-center gap-1 text-primary hover:underline disabled:opacity-50"
        />
      ) : <span>–</span>;
    case "email":
      return lead.email ? (
        <a
          href={`mailto:${lead.email}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          {lead.email}
        </a>
      ) : <span>–</span>;
    case "crm_status_id":
      return (
        <InlineStatusDropdown
          leadId={lead.id}
          currentStatusId={lead.crm_status_id}
          statuses={statuses.filter((s) => s.is_active)}
        />
      );
    case "call_count":
      return (
        <span className="inline-flex items-center gap-1">
          {lead.call_count > 0 ? (
            <>
              <MessageSquare className="h-3 w-3 text-emerald-500" />
              <span className="font-medium">{lead.call_count}</span>
            </>
          ) : (
            <span>–</span>
          )}
        </span>
      );
    case "note_count":
      return (
        <span className="inline-flex items-center gap-1">
          {lead.note_count > 0 ? (
            <>
              <StickyNote className="h-3 w-3 text-amber-500" />
              <span className="font-medium">{lead.note_count}</span>
            </>
          ) : (
            <span>–</span>
          )}
        </span>
      );
    case "last_call_at":
      return <span>{formatDate(lead.last_call_at)}</span>;
    case "updated_at":
      return <span>{formatDate(lead.updated_at)}</span>;
    case "created_at":
      return <span>{formatDate(lead.created_at)}</span>;
    case "domain":
      return lead.domain ? (
        <a
          href={`https://${lead.domain}`}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(e) => e.stopPropagation()}
          className="text-primary hover:underline"
        >
          {lead.domain}
        </a>
      ) : <span>–</span>;
    default: {
      const v = lead[colKey as keyof CrmLead];
      if (v == null) return <span>–</span>;
      return <span>{String(v)}</span>;
    }
  }
}
