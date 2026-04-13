"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2, Eye, X, Download, CircleCheck, CircleX } from "lucide-react";
import { exportLead, batchExport, getExportPreview } from "./actions";

interface QualifiedLead {
  id: string;
  company_name: string;
  domain: string | null;
  city: string | null;
  status: string;
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
  { value: "MANUELLE_UEBERPRUEFUNG", label: "Manuelle Überprüfung" },
  { value: "NEW", label: "New" },
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "ATTEMPTED_TO_CONTACT", label: "Attempted to Contact" },
  { value: "CONNECTED", label: "Connected" },
];

interface PreviewData {
  company: Record<string, string | null>;
  contacts: { name: string; role: string | null; email: string | null; phone: string | null }[];
  jobPostings: { title: string; location: string | null; url: string | null }[];
  careerPageUrl: string | null;
}

export function ExportManager({ qualifiedLeads, exportLogs }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLeadId, setPreviewLeadId] = useState<string | null>(null);
  const [previewPending, startPreview] = useTransition();
  const [exporting, setExporting] = useState(false);
  const [leadStatus, setLeadStatus] = useState("MANUELLE_UEBERPRUEFUNG");
  const [result, setResult] = useState<{ successCount: number; errorCount: number } | null>(null);

  function toggleAll() {
    if (selected.size === qualifiedLeads.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(qualifiedLeads.map((l) => l.id)));
    }
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

  return (
    <div className="mt-6 space-y-6">
      {result && (
        <div className="rounded-md bg-blue-50 p-4 text-sm dark:bg-blue-900/20 dark:text-blue-300">
          Export abgeschlossen: {result.successCount} erfolgreich, {result.errorCount} fehlgeschlagen.
        </div>
      )}

      {/* Export-Queue */}
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Export-Queue</h2>
          <div className="flex items-center gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Lead-Status in HubSpot</label>
              <select
                value={leadStatus}
                onChange={(e) => setLeadStatus(e.target.value)}
                className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
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
                className="mt-5 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
              >
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {selected.size} exportieren
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.size === qualifiedLeads.length && qualifiedLeads.length > 0}
                    onChange={toggleAll}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Firma</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Domain</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Ort</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {qualifiedLeads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    Keine qualifizierten Leads zum Exportieren.
                  </td>
                </tr>
              ) : (
                qualifiedLeads.map((lead) => (
                  <tr key={lead.id} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(lead.id)}
                        onChange={() => toggleOne(lead.id)}
                        className="rounded border-gray-300 dark:border-gray-600"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-medium" onClick={() => {
                      setPreviewLeadId(lead.id);
                      startPreview(async () => {
                        const data = await getExportPreview(lead.id);
                        setPreview(data);
                      });
                    }}>{lead.company_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400" onClick={() => router.push(`/leads/${lead.id}`)}>{lead.domain ?? "–"}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400" onClick={() => router.push(`/leads/${lead.id}`)}>{lead.city ?? "–"}</td>
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
        <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Firma</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">HubSpot-ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Fehler</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Datum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {exportLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    Noch keine Exports durchgeführt.
                  </td>
                </tr>
              ) : (
                exportLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-3 text-sm">{log.leads?.company_name ?? "–"}</td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-600 dark:text-gray-400">{log.hubspot_company_id ?? "–"}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        log.status === "success" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                        log.status === "failed" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                        log.status === "duplicate" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" :
                        "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
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
          <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <Eye className="h-5 w-5 text-primary" />
                Export-Vorschau
              </h2>
              <button onClick={() => { setPreview(null); setPreviewLeadId(null); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-6 py-4 space-y-4">
              {/* Company-Daten */}
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

              {/* Kontakte */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Kontakte → HubSpot Contacts ({preview.contacts.length})</h3>
                {preview.contacts.length === 0 ? (
                  <p className="mt-1 text-sm text-gray-400">Keine Kontakte</p>
                ) : (
                  <div className="mt-2 space-y-1">
                    {preview.contacts.map((c, i) => (
                      <div key={i} className="rounded-md border border-gray-100 px-3 py-2 text-sm dark:border-gray-800">
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

              {/* Stellen */}
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
            <div className="flex gap-2 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
              <button
                onClick={async () => {
                  await exportLead(previewLeadId, leadStatus);
                  setPreview(null);
                  setPreviewLeadId(null);
                }}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
              >
                <Send className="h-4 w-4" />
                Jetzt exportieren
              </button>
              <button
                onClick={() => window.open(`/api/export-csv?ids=${previewLeadId}`, "_blank")}
                className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                <Download className="h-4 w-4" />
                Als CSV
              </button>
              <button
                onClick={() => { setPreview(null); setPreviewLeadId(null); }}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
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
