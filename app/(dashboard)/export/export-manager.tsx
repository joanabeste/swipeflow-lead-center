"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2 } from "lucide-react";
import { exportLead, batchExport } from "./actions";

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

export function ExportManager({ qualifiedLeads, exportLogs }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
                    <td className="px-4 py-3 text-sm font-medium" onClick={() => router.push(`/leads/${lead.id}`)}>{lead.company_name}</td>
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
    </div>
  );
}
