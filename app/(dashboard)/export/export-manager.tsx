"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Send, Loader2, Eye, X, Download, CircleCheck, CircleX,
  Search, ArrowUpDown, ArrowUp, ArrowDown, Briefcase, Globe,
} from "lucide-react";
import { exportLead, batchExport, getExportPreview } from "./actions";

export interface QualifiedLead {
  id: string;
  company_name: string;
  domain: string | null;
  city: string | null;
  industry: string | null;
  company_size: string | null;
  phone: string | null;
  email: string | null;
  service_type: "recruiting" | "webdesign";
  contacts_count: number;
  jobs_count: number;
  issues_count: number;
  has_ssl: boolean | null;
  website_tech: string | null;
  website_age_estimate: string | null;
  enriched_at: string | null;
  updated_at: string;
}

interface ExportLogEntry {
  id: string;
  lead_id: string;
  hubspot_company_id: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
  leads: { company_name: string } | null;
}

interface Props {
  qualifiedLeads: QualifiedLead[];
  exportLogs: ExportLogEntry[];
}

const LEAD_STATUS_OPTIONS = [
  { value: "Manuelle Überprüfung", label: "Manuelle Überprüfung" },
  { value: "Todo", label: "Todo" },
  { value: "Recruiting Lead", label: "Recruiting Lead" },
  { value: "Recruiting Todo", label: "Recruiting Todo" },
  { value: "Webdesign Lead", label: "Webdesign Lead" },
  { value: "Webdesign - Manuelle Überprüfung", label: "Webdesign — Manuelle Überprüfung" },
  { value: "NEW", label: "New" },
  { value: "Pipeline", label: "Pipeline" },
];

type TypeFilter = "all" | "recruiting" | "webdesign";
type SortKey = "company_name" | "city" | "industry" | "company_size" | "contacts_count" | "issues_count" | "updated_at";
type SortOrder = "asc" | "desc";

interface PreviewData {
  company: Record<string, string | null>;
  contacts: { name: string; role: string | null; email: string | null; phone: string | null }[];
  jobPostings: { title: string; location: string | null; url: string | null }[];
  careerPageUrl: string | null;
}

function TypeBadge({ type }: { type: "recruiting" | "webdesign" }) {
  if (type === "webdesign") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
        <Globe className="h-3 w-3" />
        Webdesign
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
      <Briefcase className="h-3 w-3" />
      Recruiting
    </span>
  );
}

function SortIcon({ active, order }: { active: boolean; order: SortOrder }) {
  if (!active) return <ArrowUpDown className="h-3 w-3 text-gray-400" />;
  return order === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
}

export function ExportManager({ qualifiedLeads, exportLogs }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLeadId, setPreviewLeadId] = useState<string | null>(null);
  const [previewPending, startPreview] = useTransition();
  const [exporting, setExporting] = useState(false);
  const [leadStatus, setLeadStatus] = useState("Manuelle Überprüfung");
  const [result, setResult] = useState<{ successCount: number; errorCount: number } | null>(null);

  // Filter / Search / Sort State
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("updated_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const filteredLeads = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = qualifiedLeads.filter((l) => {
      if (typeFilter !== "all" && l.service_type !== typeFilter) return false;
      if (term) {
        const haystack = [
          l.company_name, l.domain, l.city, l.industry, l.company_size, l.phone, l.email,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const aEmpty = av == null || av === "";
      const bEmpty = bv == null || bv === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv), "de");
      return sortOrder === "asc" ? cmp : -cmp;
    });

    return list;
  }, [qualifiedLeads, search, typeFilter, sortKey, sortOrder]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortOrder("asc"); }
  }

  function toggleAll() {
    const visibleIds = filteredLeads.map((l) => l.id);
    const allSelected = visibleIds.every((id) => selected.has(id));
    const next = new Set(selected);
    if (allSelected) visibleIds.forEach((id) => next.delete(id));
    else visibleIds.forEach((id) => next.add(id));
    setSelected(next);
  }

  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function handleBatchExport() {
    setExporting(true);
    try {
      const res = await batchExport(Array.from(selected), leadStatus);
      setResult(res);
      setSelected(new Set());
    } finally {
      setExporting(false);
    }
  }

  async function handleSingleExport(id: string) {
    setExporting(true);
    try {
      await exportLead(id, leadStatus);
    } finally {
      setExporting(false);
    }
  }

  const allVisibleSelected = filteredLeads.length > 0 && filteredLeads.every((l) => selected.has(l.id));

  return (
    <div className="mt-6 space-y-6">
      {result && (
        <div className="rounded-md bg-green-50 p-4 text-sm dark:bg-green-900/20 dark:text-green-300">
          Export abgeschlossen: {result.successCount} erfolgreich, {result.errorCount} fehlgeschlagen.
        </div>
      )}

      {/* Export-Queue */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Export-Queue</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Lead-Status in HubSpot</label>
              <select
                value={leadStatus}
                onChange={(e) => setLeadStatus(e.target.value)}
                className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
              >
                {LEAD_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            {selected.size > 0 && (
              <button
                onClick={handleBatchExport}
                disabled={exporting}
                className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
              >
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {selected.size} exportieren
              </button>
            )}
          </div>
        </div>

        {/* Toolbar: Suche + Typ-Filter */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Firma, Domain, Stadt, Branche…"
              className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#1c1c1e] dark:text-gray-100 dark:placeholder-gray-500"
            />
          </div>
          <div className="inline-flex rounded-md border border-gray-300 bg-white dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
            {([
              { value: "all", label: `Alle (${qualifiedLeads.length})` },
              { value: "recruiting", label: `Recruiting (${qualifiedLeads.filter((l) => l.service_type === "recruiting").length})` },
              { value: "webdesign", label: `Webdesign (${qualifiedLeads.filter((l) => l.service_type === "webdesign").length})` },
            ] as { value: TypeFilter; label: string }[]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTypeFilter(opt.value)}
                className={`px-3 py-2 text-xs font-medium transition ${
                  typeFilter === opt.value
                    ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-[#232325]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {filteredLeads.length} angezeigt
          </span>
        </div>

        <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-[#2c2c2e]">
            <thead className="bg-gray-50 dark:bg-[#232325]">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                </th>
                <Th label="Firma" sortKey="company_name" active={sortKey} order={sortOrder} onClick={toggleSort} />
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Typ</th>
                <Th label="Stadt" sortKey="city" active={sortKey} order={sortOrder} onClick={toggleSort} />
                <Th label="Branche" sortKey="industry" active={sortKey} order={sortOrder} onClick={toggleSort} />
                <Th label="Größe" sortKey="company_size" active={sortKey} order={sortOrder} onClick={toggleSort} />
                <Th label="Kontakte" sortKey="contacts_count" active={sortKey} order={sortOrder} onClick={toggleSort} align="right" />
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Stellen/Issues</th>
                <Th label="Angereichert" sortKey="updated_at" active={sortKey} order={sortOrder} onClick={toggleSort} />
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-[#2c2c2e]">
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    {qualifiedLeads.length === 0
                      ? "Keine qualifizierten Leads zum Exportieren."
                      : "Keine Treffer für Suche/Filter."}
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(lead.id)}
                        onChange={() => toggleOne(lead.id)}
                        className="rounded border-gray-300 dark:border-gray-600"
                      />
                    </td>
                    <td
                      className="cursor-pointer px-4 py-3 text-sm font-medium"
                      onClick={() => {
                        setPreviewLeadId(lead.id);
                        startPreview(async () => {
                          const data = await getExportPreview(lead.id);
                          setPreview(data);
                        });
                      }}
                    >
                      {lead.company_name}
                      {lead.domain && (
                        <div className="text-xs font-normal text-gray-500 dark:text-gray-400">{lead.domain}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <TypeBadge type={lead.service_type} />
                    </td>
                    <td className="cursor-pointer px-4 py-3 text-sm text-gray-600 dark:text-gray-400" onClick={() => router.push(`/leads/${lead.id}`)}>
                      {lead.city ?? "–"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{lead.industry ?? "–"}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{lead.company_size ?? "–"}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium">{lead.contacts_count}</td>
                    <td className="px-4 py-3 text-right text-sm">
                      {lead.service_type === "webdesign" ? (
                        <span className={lead.issues_count > 0 ? "font-medium text-orange-600 dark:text-orange-400" : "text-gray-400"}>
                          {lead.issues_count} Issues
                        </span>
                      ) : (
                        <span className={lead.jobs_count > 0 ? "font-medium" : "text-gray-400"}>
                          {lead.jobs_count} Stellen
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {lead.enriched_at ? new Date(lead.enriched_at).toLocaleDateString("de-DE") : "–"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleSingleExport(lead.id)}
                        disabled={exporting}
                        className="text-sm text-primary hover:underline disabled:opacity-50"
                      >
                        Exportieren
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Export-Historie */}
      <div>
        <h2 className="text-lg font-bold">Export-Historie</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-[#2c2c2e]">
            <thead className="bg-gray-50 dark:bg-[#232325]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Firma</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">HubSpot-ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Fehler</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Datum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-[#2c2c2e]">
              {exportLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    Noch keine Exports durchgeführt.
                  </td>
                </tr>
              ) : (
                exportLogs.map((log) => (
                  <tr key={log.id} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5">
                    <td className="px-4 py-3 text-sm font-medium text-primary hover:underline" onClick={() => router.push(`/leads/${log.lead_id}`)}>{log.leads?.company_name ?? "–"}</td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-600 dark:text-gray-400">{log.hubspot_company_id ?? "–"}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        log.status === "success" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                        log.status === "failed" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                        log.status === "duplicate" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" :
                        "bg-gray-100 text-gray-700 dark:bg-[#232325] dark:text-gray-300"
                      }`}>
                        {log.status === "success" ? "Erfolgreich" :
                         log.status === "failed" ? "Fehlgeschlagen" :
                         log.status === "duplicate" ? "Duplikat" : "Ausstehend"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-red-600 dark:text-red-400">{log.error_message ?? "–"}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {new Date(log.created_at).toLocaleString("de-DE")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Vorschau-Modal */}
      {preview && previewLeadId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-[#2c2c2e]">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <Eye className="h-5 w-5 text-primary" />
                Export-Vorschau
              </h2>
              <button onClick={() => { setPreview(null); setPreviewLeadId(null); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-6 py-4 space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Firmendaten → HubSpot Company</h3>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {Object.entries(preview.company).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-2 text-sm">
                      {val ? <CircleCheck className="h-3.5 w-3.5 text-green-500" /> : <CircleX className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600" />}
                      <span className="text-gray-500 dark:text-gray-400">{key}:</span>
                      <span className={val ? "font-medium" : "text-gray-300 dark:text-gray-600"}>{val || "leer"}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Kontakte → HubSpot Contacts ({preview.contacts.length})</h3>
                {preview.contacts.length === 0 ? (
                  <p className="mt-1 text-sm text-gray-400">Keine Kontakte</p>
                ) : (
                  <div className="mt-2 space-y-1">
                    {preview.contacts.map((c, i) => (
                      <div key={i} className="rounded-md border border-gray-100 px-3 py-2 text-sm dark:border-[#2c2c2e]">
                        <span className="font-medium">{c.name}</span>
                        {c.role && <span className="text-gray-400"> — {c.role}</span>}
                        <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400">
                          {c.email && <span>{c.email}</span>}
                          {c.phone && <span>{c.phone}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Stellenanzeigen → HubSpot Notiz ({preview.jobPostings.length})</h3>
                {preview.jobPostings.length === 0 ? (
                  <p className="mt-1 text-sm text-gray-400">Keine Stellen</p>
                ) : (
                  <div className="mt-2 space-y-1">
                    {preview.jobPostings.map((j, i) => (
                      <div key={i} className="text-sm">
                        <span className="font-medium">{j.title}</span>
                        {j.location && <span className="text-gray-400"> — {j.location}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {preview.careerPageUrl && (
                  <p className="mt-1 text-xs text-primary">{preview.careerPageUrl}</p>
                )}
              </div>
            </div>
            <div className="flex gap-2 border-t border-gray-200 px-6 py-4 dark:border-[#2c2c2e]">
              <button
                onClick={async () => {
                  await exportLead(previewLeadId, leadStatus);
                  setPreview(null);
                  setPreviewLeadId(null);
                }}
                className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
              >
                <Send className="h-4 w-4" />
                Jetzt exportieren
              </button>
              <button
                onClick={() => window.open(`/api/export-csv?ids=${previewLeadId}`, "_blank")}
                className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 dark:border-[#2c2c2e] dark:hover:bg-white/5"
              >
                <Download className="h-4 w-4" />
                Als CSV
              </button>
              <button
                onClick={() => { setPreview(null); setPreviewLeadId(null); }}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 dark:border-[#2c2c2e] dark:hover:bg-white/5"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
      {previewPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}

function Th({
  label, sortKey, active, order, onClick, align = "left",
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  order: SortOrder;
  onClick: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  return (
    <th className={`px-4 py-3 text-xs font-medium uppercase text-gray-500 dark:text-gray-400 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        onClick={() => onClick(sortKey)}
        className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""} hover:text-gray-700 dark:hover:text-gray-200`}
      >
        {label}
        <SortIcon active={active === sortKey} order={order} />
      </button>
    </th>
  );
}
