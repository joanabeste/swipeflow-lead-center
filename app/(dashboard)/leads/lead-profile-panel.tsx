"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, AlertTriangle, RotateCcw, Sparkles, Loader2, Trash2, Activity, ChevronDown, Archive,
} from "lucide-react";
import type { Lead, LeadChange, LeadContact, LeadJobPosting, LeadEnrichment, LeadStatus, CustomLeadStatus } from "@/lib/types";
import { bulkRestoreCrmStatus, bulkArchiveLeads } from "./actions";
import type { HqLocation } from "@/lib/app-settings";
import { updateLead, deleteLead } from "./actions";
import { ResizableColumns } from "@/components/resizable-columns";
import { SingleLeadEnrichModal } from "./single-lead-enrich-modal";
import { EnrichmentDiagnosisModal } from "./enrichment-diagnosis-modal";
import { DEFAULT_ENRICHMENT_CONFIG } from "@/lib/types";
import { useServiceMode } from "@/lib/service-mode";
import { LeadMasterDataForm } from "./_components/lead-master-data-form";
import { LeadContactsList } from "./_components/lead-contacts-list";
import { LeadJobPostingsList } from "./_components/lead-job-postings-list";
import { LeadLocationCard } from "./_components/lead-location-card";
import { LeadDuplicatesCard } from "./_components/lead-duplicates-card";
import { LeadActivityTimeline, LeadChangesList, type ActivityItem } from "./_components/lead-history-list";

export type { ActivityItem };

const statusOptions: { value: string; label: string; color: string }[] = [
  { value: "imported", label: "Importiert", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  { value: "filtered", label: "Gefiltert", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  { value: "cancelled", label: "Ausgeschlossen", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  { value: "enrichment_pending", label: "Anreicherung", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  { value: "enriched", label: "Angereichert", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  { value: "qualified", label: "Qualifiziert", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  { value: "exported", label: "Exportiert", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
];

interface Props {
  lead: Lead;
  changes: LeadChange[];
  contacts: LeadContact[];
  jobPostings: LeadJobPosting[];
  latestEnrichment: LeadEnrichment | null;
  /** Wird für das Aussortier-Banner gebraucht (zeigt Label + Wiederherstellen). */
  customStatuses?: CustomLeadStatus[];
  hq: HqLocation;
  backHref?: string;
  backLabel?: string;
  headerExtras?: React.ReactNode;
  extraRightColumn?: React.ReactNode;
  activityItems?: ActivityItem[];
  resizableRightColumn?: boolean;
  resizeStorageKey?: string;
}

export function LeadProfilePanel({
  lead, changes, contacts, jobPostings, latestEnrichment, hq,
  customStatuses = [],
  backHref = "/leads",
  backLabel = "Zurück zur Liste",
  headerExtras,
  extraRightColumn,
  activityItems,
  resizableRightColumn = false,
  resizeStorageKey = "lead-panel-right-width",
}: Props) {
  const router = useRouter();
  const { mode: serviceMode } = useServiceMode();
  const [currentStatus, setCurrentStatus] = useState<LeadStatus>(lead.status);
  const [statusPending, startStatusTransition] = useTransition();
  const [deletePending, startDeleteTransition] = useTransition();
  const [enrichModalOpen, setEnrichModalOpen] = useState(false);
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);

  const enrichmentRunning = latestEnrichment?.status === "running";
  const enrichmentFailed = latestEnrichment?.status === "failed";

  const hasWebsite = !!(lead.website || lead.domain);
  const statusInfo = statusOptions.find((s) => s.value === currentStatus) ?? statusOptions[0];

  // Aussortier-Banner: ist der zugewiesene CRM-Status archived markiert?
  const archivedStatus = lead.crm_status_id
    ? customStatuses.find((s) => s.id === lead.crm_status_id && s.is_archived)
    : null;
  const [unarchivePending, startUnarchive] = useTransition();
  function handleUnarchive() {
    startUnarchive(async () => {
      const res = await bulkRestoreCrmStatus([{ id: lead.id, crm_status_id: null }]);
      if (!("error" in res) || !res.error) router.refresh();
    });
  }

  const [archivePending, startArchiveTransition] = useTransition();
  function handleArchive() {
    if (archivedStatus) return;
    if (!confirm("Lead aussortieren? Er erscheint nicht mehr unter Neue Leads oder im CRM und wird der KI als Negativ-Signal gemeldet. Du kannst ihn jederzeit ueber das Banner wiederherstellen.")) return;
    startArchiveTransition(async () => {
      const mode = serviceMode === "webdev" ? "webdev" : "recruiting";
      const res = await bulkArchiveLeads([lead.id], mode);
      if ("error" in res && res.error) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  }

  function handleStatusChange(newStatus: LeadStatus) {
    setCurrentStatus(newStatus);
    startStatusTransition(async () => {
      await updateLead(lead.id, { status: newStatus });
    });
  }

  function handleDelete() {
    if (!confirm("Lead in den Papierkorb verschieben? Du kannst ihn 30 Tage lang unter Einstellungen → Papierkorb wiederherstellen.")) return;
    startDeleteTransition(async () => {
      const res = await deleteLead(lead.id);
      if (!res.error) router.push(backHref);
    });
  }

  const leftContent = (
    <>
      <LeadMasterDataForm lead={lead} />
      <LeadContactsList leadId={lead.id} contacts={contacts} hasWebsite={hasWebsite} />
      <LeadJobPostingsList jobPostings={jobPostings} latestEnrichment={latestEnrichment} hasWebsite={hasWebsite} />
    </>
  );

  const rightContent = (
    <>
      {extraRightColumn}
      <LeadLocationCard lead={lead} hq={hq} />
      <LeadDuplicatesCard leadId={lead.id} />
      {activityItems
        ? <LeadActivityTimeline items={activityItems} />
        : <LeadChangesList changes={changes} />}
    </>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => router.push(backHref)}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </button>
        <div className="flex items-center gap-1.5">
          {headerExtras}

          {/* Anreicherungs-Status als dezenter Indikator (gleiche Hoehe wie Aktionen). */}
          {(enrichmentRunning || enrichmentFailed) && latestEnrichment && (
            <button
              onClick={() => setDiagnosisOpen(true)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium ${
                enrichmentRunning
                  ? "border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 dark:border-yellow-900/40 dark:bg-yellow-900/20 dark:text-yellow-300 dark:hover:bg-yellow-900/40"
                  : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/40"
              }`}
              title={enrichmentRunning ? "Anreicherung läuft — Diagnose öffnen" : "Anreicherung fehlgeschlagen — Details ansehen"}
            >
              {enrichmentRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Activity className="h-3 w-3" />}
              <span className="hidden sm:inline">
                {enrichmentRunning ? "Anreicherung läuft" : "Fehlgeschlagen"}
              </span>
            </button>
          )}

          {/* Anreichern — primary action */}
          <button
            onClick={() => setEnrichModalOpen(true)}
            disabled={!hasWebsite}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-gray-900 px-3 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
            title={!hasWebsite ? "Keine Website/Domain vorhanden" : undefined}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {contacts.length > 0 ? "Erneut anreichern" : "Anreichern"}
          </button>

          {/* Status-Dropdown — als farbiger Pill mit Caret + spinning Loader bei pending. */}
          <div className="relative">
            <select
              value={currentStatus}
              onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
              disabled={statusPending}
              className={`h-8 cursor-pointer appearance-none rounded-lg border-0 pl-3 pr-7 text-xs font-medium focus:ring-2 focus:ring-primary focus:outline-none ${statusInfo.color} ${statusPending ? "opacity-50" : ""}`}
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-current opacity-70">
              {statusPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronDown className="h-3 w-3" />}
            </span>
          </div>

          {/* Aussortieren — neutral, nicht destruktiv. Banner uebernimmt das Wiederherstellen. */}
          {!archivedStatus && (
            <button
              onClick={handleArchive}
              disabled={archivePending}
              title="Lead aussortieren — erscheint nicht mehr in Neue Leads oder im CRM"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {archivePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Aussortieren</span>
            </button>
          )}

          {/* Loeschen — destructive, etwas separiert. */}
          <button
            onClick={handleDelete}
            disabled={deletePending}
            title="Lead in den Papierkorb verschieben"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm text-red-500 hover:bg-red-50 hover:border-red-200 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-red-900/10 dark:hover:border-red-900/40"
          >
            {deletePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Löschen</span>
          </button>
        </div>
      </div>

      {/* Firmenname + Erstellt */}
      <div className="mt-4">
        <h1 className="text-2xl font-bold tracking-tight">{lead.company_name}</h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          Erstellt: {new Date(lead.created_at).toLocaleDateString("de-DE")}
          {latestEnrichment?.status === "completed" && (
            <> · Angereichert: {new Date(latestEnrichment.completed_at!).toLocaleDateString("de-DE")}</>
          )}
        </p>
      </div>

      {/* Banner: Aussortiert (CRM-Status mit is_archived). */}
      {archivedStatus && (
        <div className="mt-4 flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900/40 dark:bg-red-900/15">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600 dark:text-red-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800 dark:text-red-300">
              Aussortiert · {archivedStatus.label}
            </p>
            <p className="mt-0.5 text-xs text-red-700/90 dark:text-red-400/90">
              Erscheint nicht in Neue Leads oder im CRM. Wird der KI als Negativ-Signal gemeldet.
            </p>
          </div>
          <button
            onClick={handleUnarchive}
            disabled={unarchivePending}
            className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-900/30"
          >
            {unarchivePending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
            Wiederherstellen
          </button>
        </div>
      )}

      {/* Banner: Cancel / Blacklist */}
      {(lead.cancel_reason || (lead.blacklist_hit && lead.blacklist_reason)) && (
        <div className="mt-4 flex items-start gap-3 rounded-md border border-orange-200 bg-orange-50 p-3 dark:border-orange-800 dark:bg-orange-900/20">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-orange-600 dark:text-orange-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-orange-800 dark:text-orange-300">
              {lead.status === "cancelled" ? "Automatisch ausgeschlossen" : "Blacklist-Treffer"}
            </p>
            <p className="mt-0.5 text-xs text-orange-700 dark:text-orange-400">
              {lead.cancel_reason ?? lead.blacklist_reason}
            </p>
          </div>
          {(lead.status === "cancelled" || lead.status === "filtered") && (
            <button
              onClick={() => handleStatusChange("imported")}
              disabled={statusPending}
              className="inline-flex items-center gap-1 rounded-md border border-orange-300 px-2.5 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-orange-900/30"
            >
              <RotateCcw className="h-3 w-3" />
              Trotzdem fortfahren
            </button>
          )}
        </div>
      )}

      <div className="mt-6">
        {resizableRightColumn ? (
          <ResizableColumns
            left={<div className="space-y-6">{leftContent}</div>}
            right={<div className="space-y-4">{rightContent}</div>}
            storageKey={resizeStorageKey}
            defaultRight={540}
            minRight={360}
            maxRight={900}
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">{leftContent}</div>
            <div className="space-y-4">{rightContent}</div>
          </div>
        )}
      </div>

      {enrichModalOpen && (
        <SingleLeadEnrichModal
          leadId={lead.id}
          leadName={lead.company_name}
          defaultConfig={{ ...DEFAULT_ENRICHMENT_CONFIG }}
          serviceMode={serviceMode}
          onClose={() => setEnrichModalOpen(false)}
        />
      )}

      {diagnosisOpen && latestEnrichment && (
        <EnrichmentDiagnosisModal
          enrichment={latestEnrichment}
          leadId={lead.id}
          onClose={() => setDiagnosisOpen(false)}
        />
      )}
    </div>
  );
}
