"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, AlertTriangle, RotateCcw, Sparkles, Loader2, Trash2, Activity, ChevronDown, Archive, Search, Send,
} from "lucide-react";
import type { Lead, LeadChange, LeadContact, LeadJobPosting, LeadEnrichment, LeadStatus, CustomLeadStatus } from "@/lib/types";
import { bulkRestoreCrmStatus, bulkArchiveLeads } from "./actions";
import type { HqLocation } from "@/lib/app-settings";
import { updateLead, deleteLead, bulkUpdateStatus } from "./actions";
import { enrichAndMoveToCrm } from "./enrichment-actions";
import { DEFAULT_QUALIFY_STATUS_BY_MODE } from "@/lib/service-mode-constants";
import { usePreviewRefresh } from "@/lib/preview-refresh-context";
import { ResizableColumns } from "@/components/resizable-columns";
import { SingleLeadEnrichModal } from "./single-lead-enrich-modal";
import { EnrichmentDiagnosisModal } from "./enrichment-diagnosis-modal";
import { DEFAULT_ENRICHMENT_CONFIG, LEAD_STATUS_OPTIONS as statusOptions } from "@/lib/types";
import { useServiceMode } from "@/lib/service-mode";
import { LeadMasterDataForm } from "./_components/lead-master-data-form";
import { CrmContactsCard } from "../crm/[id]/_components/crm-contacts-card";
import { CrmJobsCard } from "../crm/[id]/_components/crm-jobs-card";
import { LeadLocationCard } from "./_components/lead-location-card";
import { CrmDuplicateWarning } from "../crm/[id]/_components/crm-duplicate-warning";
import type { DuplicateCandidate } from "@/lib/leads/find-existing";
import { LeadActivityTimeline, LeadChangesList, type ActivityItem } from "./_components/lead-history-list";
import { useToastContext } from "../toast-provider";

export type { ActivityItem };

interface Props {
  lead: Lead;
  changes: LeadChange[];
  contacts: LeadContact[];
  jobPostings: LeadJobPosting[];
  latestEnrichment: LeadEnrichment | null;
  /** Wird für das Aussortier-Banner gebraucht (zeigt Label + Wiederherstellen). */
  customStatuses?: CustomLeadStatus[];
  hq: HqLocation;
  /** Mutmaßliche Duplikate dieses Leads (serverseitig ermittelt) — für das Warnbanner. */
  duplicates?: DuplicateCandidate[];
  backHref?: string;
  backLabel?: string;
  /** Wenn gesetzt: ersetzt die Page-Navigation des Zurueck-Buttons (z.B. fuer Drawer-Close). */
  onBack?: () => void;
  headerExtras?: React.ReactNode;
  extraRightColumn?: React.ReactNode;
  activityItems?: ActivityItem[];
  resizableRightColumn?: boolean;
  resizeStorageKey?: string;
}

export function LeadProfilePanel({
  lead, changes, contacts, jobPostings, latestEnrichment, hq,
  customStatuses = [],
  duplicates = [],
  backHref = "/leads",
  backLabel = "Zurück zur Liste",
  onBack,
  headerExtras,
  extraRightColumn,
  activityItems,
  resizableRightColumn = false,
  resizeStorageKey = "lead-panel-right-width",
}: Props) {
  const router = useRouter();
  const notify = usePreviewRefresh();
  const { mode: serviceMode } = useServiceMode();
  const { addToast } = useToastContext();
  const [currentStatus, setCurrentStatus] = useState<LeadStatus>(lead.status);
  const [statusPending, startStatusTransition] = useTransition();
  const [deletePending, startDeleteTransition] = useTransition();
  const [enrichModalOpen, setEnrichModalOpen] = useState(false);
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);
  const [crmPending, startCrmTransition] = useTransition();
  const [crmBusy, setCrmBusy] = useState<"crm" | "enrich" | null>(null);

  const enrichmentRunning = latestEnrichment?.status === "running";
  const enrichmentFailed = latestEnrichment?.status === "failed";

  const hasWebsite = !!lead.website;
  const statusInfo = statusOptions.find((s) => s.value === currentStatus) ?? statusOptions[0];
  // Liegt der Lead schon im CRM? Dann blenden wir die CRM-Vorwärts-Buttons aus.
  // (lead.crm_status_id ist der frische Prop nach notify(); currentStatus deckt
  //  die optimistische manuelle Status-Änderung ab.)
  const alreadyInCrm =
    lead.crm_status_id != null || currentStatus === "qualified" || currentStatus === "exported";

  function handleMoveToCrm() {
    if (crmPending) return;
    setCrmBusy("crm");
    startCrmTransition(async () => {
      const res = await bulkUpdateStatus([lead.id], "qualified", DEFAULT_QUALIFY_STATUS_BY_MODE[serviceMode]);
      setCrmBusy(null);
      if ("error" in res && res.error) {
        addToast(`Fehler: ${res.error}`, "error");
        return;
      }
      addToast("Lead ins CRM verschoben", "success", { action: { label: "Zum CRM", href: "/crm" } });
      notify();
    });
  }

  function handleEnrichAndCrm() {
    if (crmPending) return;
    setCrmBusy("enrich");
    startCrmTransition(async () => {
      // config undefined → DEFAULT_ENRICHMENT_CONFIG (ohne Ampel, schneller).
      const res = await enrichAndMoveToCrm(lead.id, undefined, serviceMode);
      setCrmBusy(null);
      if ("error" in res) {
        addToast(`Fehler: ${res.error}`, "error");
        return;
      }
      addToast("Lead angereichert & ins CRM verschoben", "success", {
        action: { label: "Zum CRM", href: "/crm" },
      });
      notify();
    });
  }

  // Aussortier-Banner: ist der zugewiesene CRM-Status archived markiert?
  const archivedStatus = lead.crm_status_id
    ? customStatuses.find((s) => s.id === lead.crm_status_id && s.is_archived)
    : null;
  const [unarchivePending, startUnarchive] = useTransition();
  function handleUnarchive() {
    startUnarchive(async () => {
      const res = await bulkRestoreCrmStatus([{ id: lead.id, crm_status_id: null }]);
      if (!("error" in res) || !res.error) notify();
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
        addToast(res.error, "error");
        return;
      }
      addToast("Lead aussortiert.", "success");
      notify();
    });
  }

  function handleStatusChange(newStatus: LeadStatus) {
    setCurrentStatus(newStatus);
    startStatusTransition(async () => {
      await updateLead(lead.id, { status: newStatus });
      notify();
    });
  }

  function handleDelete() {
    if (!confirm("Lead in den Papierkorb verschieben? Du kannst ihn 30 Tage lang unter Einstellungen → Papierkorb wiederherstellen.")) return;
    startDeleteTransition(async () => {
      const res = await deleteLead(lead.id);
      if (res.error) {
        addToast(res.error, "error");
        return;
      }
      addToast("Lead in den Papierkorb verschoben.", "success");
      if (onBack) onBack();
      else router.push(backHref);
    });
  }

  const leftContent = (
    <>
      <LeadMasterDataForm lead={lead} />
      <CrmContactsCard
        leadId={lead.id}
        contacts={contacts}
        jobs={jobPostings}
        companyName={lead.company_name}
      />
      <CrmJobsCard
        leadId={lead.id}
        jobs={jobPostings}
        careerPageUrl={latestEnrichment?.career_page_url ?? null}
      />
    </>
  );

  const rightContent = (
    <>
      {extraRightColumn}
      <LeadLocationCard lead={lead} hq={hq} />
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
          onClick={() => (onBack ? onBack() : router.push(backHref))}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </button>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
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

          {/* ── Vorwärts-Aktionen: alle sichtbar in der Leiste ────────────── */}

          {/* Anreichern + ins CRM — primäre Aktion (golden). Auch ohne Website:
              der Backend-Flow sucht via findCompanyWebsite() automatisch. */}
          {!alreadyInCrm && (
            <button
              onClick={handleEnrichAndCrm}
              disabled={crmPending}
              title="Lead anreichern und anschließend automatisch ins CRM übernehmen"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-gray-900 transition hover:bg-primary-dark disabled:opacity-50"
            >
              {crmBusy === "enrich" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {crmBusy === "enrich" ? "Wird angereichert…" : "Anreichern + ins CRM"}
            </button>
          )}

          {/* Nur anreichern (öffnet Konfig-Dialog) — auch für CRM-Leads. */}
          <button
            onClick={() => setEnrichModalOpen(true)}
            disabled={crmPending}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            title={!hasWebsite ? "Keine Website hinterlegt — wird beim Anreichern automatisch gesucht" : "Anreichern mit Optionen"}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {contacts.length > 0 ? "Erneut anreichern" : "Anreichern"}
          </button>

          {/* Nur ins CRM (ohne Anreicherung). */}
          {!alreadyInCrm && (
            <button
              onClick={handleMoveToCrm}
              disabled={crmPending}
              title="Lead direkt ins CRM übernehmen"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {crmBusy === "crm" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Ins CRM
            </button>
          )}

          {/* Trenner zum dezenten Sekundär-Cluster */}
          <span className="mx-0.5 h-5 w-px bg-gray-200 dark:bg-gray-700" aria-hidden />

          {/* Aussortieren — Icon + Label, damit die Aktion verständlich ist. */}
          {!archivedStatus && (
            <button
              onClick={handleArchive}
              disabled={archivePending}
              title="Aussortieren — erscheint nicht mehr in Neue Leads oder im CRM"
              aria-label="Aussortieren"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              {archivePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
              Aussortieren
            </button>
          )}

          {/* Löschen — nur Mülleimer-Icon (Tooltip). */}
          <button
            onClick={handleDelete}
            disabled={deletePending}
            title="In den Papierkorb verschieben"
            aria-label="Löschen"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-red-500 hover:bg-red-50 hover:border-red-200 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-red-900/10 dark:hover:border-red-900/40"
          >
            {deletePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Firmenname + Erstellt */}
      <div className="mt-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{lead.company_name}</h1>
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(lead.company_name)}`}
            target="_blank"
            rel="noreferrer"
            title="Firma googeln"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5 dark:hover:text-gray-200"
          >
            <Search className="h-4 w-4" />
          </a>
        </div>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          Erstellt: {new Date(lead.created_at).toLocaleDateString("de-DE")}
          {latestEnrichment?.status === "completed" && (
            <> · Angereichert: {new Date(latestEnrichment.completed_at!).toLocaleDateString("de-DE")}</>
          )}
        </p>

        {/* Status — dezent, direkt unter dem Erstellt-Datum (selten gebraucht). */}
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Status:</span>
          <div className="relative inline-flex">
            <select
              value={currentStatus}
              onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
              disabled={statusPending}
              title="Lead-Status"
              className={`h-8 cursor-pointer appearance-none rounded-lg border-0 pl-2.5 pr-6 text-xs font-medium focus:ring-2 focus:ring-primary focus:outline-none ${statusInfo.color} ${statusPending ? "opacity-50" : ""}`}
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-current opacity-70">
              {statusPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronDown className="h-3 w-3" />}
            </span>
          </div>
        </div>
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

      {/* Duplikat-Warnung — andere Leads, die mutmaßlich dieselbe Firma sind. */}
      {duplicates.length > 0 && (
        <div className="mt-4">
          <CrmDuplicateWarning leadId={lead.id} candidates={duplicates} />
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
          // @3xl: reagiert auf Container-Breite (Drawer ~768px+), lg: auf
          // Viewport — fuer die Vollseite. Beides parallel anwendbar.
          <div className="grid gap-6 @3xl:grid-cols-3 lg:grid-cols-3">
            <div className="space-y-6 @3xl:col-span-2 lg:col-span-2">{leftContent}</div>
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
