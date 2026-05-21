"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Sparkles, AlertTriangle, RotateCcw, Trash2, Loader2, Archive } from "lucide-react";
import type {
  CustomLeadStatus, Lead, LeadChange, LeadContact, LeadJobPosting, LeadNote, LeadCall, LeadEnrichment,
  EmailMessage, LeadTodo,
} from "@/lib/types";
import { DEFAULT_ENRICHMENT_CONFIG } from "@/lib/types";
import type { HqLocation } from "@/lib/app-settings";
import type { DealStage, DealWithRelations } from "@/lib/deals/types";
import type { CaseStudy, Industry, LandingPage } from "@/lib/landing-pages/types";
import { ResizableColumns } from "@/components/resizable-columns";
import { CrmLeftColumn } from "./crm-left-column";
import { CrmActivityFeed } from "./crm-activity-feed";
import { LeadTodosCard } from "./_components/lead-todos-card";
import { SingleLeadEnrichModal } from "../../leads/single-lead-enrich-modal";
import { deleteLead, bulkArchiveLeads, bulkRestoreCrmStatus } from "../../leads/actions";
import { useServiceMode } from "@/lib/service-mode";

type AuthorProfile = { name: string; avatar_url: string | null };
type NoteRow = LeadNote & { profiles: AuthorProfile | null };
type CallRow = LeadCall & { profiles: AuthorProfile | null };
type EmailRow = EmailMessage & {
  profiles: AuthorProfile | null;
  contact_name: string | null;
};
type AuditRow = {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
  profiles: AuthorProfile | null;
};

interface Props {
  lead: Lead;
  contacts: LeadContact[];
  jobs: LeadJobPosting[];
  notes: NoteRow[];
  calls: CallRow[];
  emails: EmailRow[];
  enrichments: LeadEnrichment[];
  changes: LeadChange[];
  auditLogs: AuditRow[];
  statuses: CustomLeadStatus[];
  hq: HqLocation;
  callProviders: { phonemondo: boolean; webex: boolean };
  senderName: string | null;
  deals: DealWithRelations[];
  dealStages: DealStage[];
  team: { id: string; name: string; avatarUrl: string | null }[];
  industries: Industry[];
  caseStudies: CaseStudy[];
  landingPages: LandingPage[];
  todos: LeadTodo[];
  backHref?: string;
  screenshotCard?: React.ReactNode;
}

export function CrmLeadDetail({
  lead, contacts, jobs, notes, calls, emails, enrichments, changes, auditLogs, statuses, hq, callProviders, senderName,
  deals, dealStages, team, industries, caseStudies, landingPages, todos,
  backHref = "/crm",
  screenshotCard,
}: Props) {
  const router = useRouter();
  const { mode: serviceMode } = useServiceMode();
  const [enrichModalOpen, setEnrichModalOpen] = useState(false);
  const [enrichError] = useState<string | null>(null);
  const [deletePending, startDeleteTransition] = useTransition();
  const [archivePending, startArchiveTransition] = useTransition();
  const [unarchivePending, startUnarchiveTransition] = useTransition();
  const latestEnrichment = enrichments[0] ?? null;

  // Aussortier-Banner: zugeordneter CRM-Status mit is_archived=true.
  const archivedStatus = lead.crm_status_id
    ? statuses.find((s) => s.id === lead.crm_status_id && s.is_archived)
    : null;

  function handleEnrich() {
    setEnrichModalOpen(true);
  }

  function handleArchive() {
    if (archivedStatus) return;
    if (!confirm("Lead aussortieren? Er erscheint nicht mehr in Neue Leads oder im CRM und wird der KI als Negativ-Signal gemeldet. Du kannst ihn jederzeit ueber das Banner wiederherstellen.")) return;
    startArchiveTransition(async () => {
      const res = await bulkArchiveLeads([lead.id], serviceMode);
      if ("error" in res && res.error) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  }

  function handleUnarchive() {
    startUnarchiveTransition(async () => {
      const res = await bulkRestoreCrmStatus([{ id: lead.id, crm_status_id: null }]);
      if (!("error" in res) || !res.error) router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm("Lead in den Papierkorb verschieben? Du kannst ihn 30 Tage lang unter Einstellungen → Papierkorb wiederherstellen.")) return;
    startDeleteTransition(async () => {
      const res = await deleteLead(lead.id);
      if (!res.error) router.push(backHref);
    });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück zum CRM
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={handleEnrich}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 dark:border-[#2c2c2e] dark:hover:bg-white/5"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Anreichern…
          </button>
          {!archivedStatus && (
            <button
              onClick={handleArchive}
              disabled={archivePending}
              title="Lead aussortieren — erscheint nicht mehr in Neue Leads oder im CRM"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-[#2c2c2e] dark:text-gray-300 dark:hover:bg-white/5"
            >
              {archivePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
              Aussortieren
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={deletePending}
            title="Lead in den Papierkorb verschieben"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 disabled:opacity-50 dark:border-[#2c2c2e] dark:hover:bg-red-900/10"
          >
            {deletePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Löschen
          </button>
        </div>
      </div>

      {/* Aussortier-Banner — Lead ist auf einen archived Status gesetzt. */}
      {archivedStatus && (
        <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900/40 dark:bg-red-900/15">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
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

      {/* Status-Banner (Cancel/Blacklist) */}
      {(lead.cancel_reason || (lead.blacklist_hit && lead.blacklist_reason)) && (
        <div className="flex items-start gap-3 rounded-md border border-orange-200 bg-orange-50 p-3 dark:border-orange-800 dark:bg-orange-900/20">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
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
              onClick={handleEnrich}
              className="inline-flex items-center gap-1 rounded-md border border-orange-300 px-2.5 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-orange-900/30"
            >
              <RotateCcw className="h-3 w-3" />
              Erneut anreichern
            </button>
          )}
        </div>
      )}
      {enrichError && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {enrichError}
        </div>
      )}

      {/* Zwei-Spalten-Layout: links schmal (Lead-Info), rechts dominant (Activity-Feed) */}
      <ResizableColumns
        storageKey="crm-detail-left-width"
        fixedSide="left"
        defaultWidth={380}
        minWidth={300}
        maxWidth={560}
        left={
          <CrmLeftColumn
            lead={lead}
            contacts={contacts}
            jobs={jobs}
            latestEnrichment={latestEnrichment}
            hq={hq}
            senderName={senderName}
            deals={deals}
            dealStages={dealStages}
            team={team}
            industries={industries}
            caseStudies={caseStudies}
            landingPages={landingPages}
            screenshotCard={screenshotCard}
          />
        }
        right={
          <div className="space-y-4">
            <CrmActivityFeed
              leadId={lead.id}
              leadPhone={lead.phone}
              companyName={lead.company_name}
              senderName={senderName}
              currentStatusId={lead.crm_status_id}
              statuses={statuses}
              contacts={contacts}
              notes={notes}
              calls={calls}
              emails={emails}
              enrichments={enrichments}
              changes={changes}
              auditLogs={auditLogs}
              callProviders={callProviders}
            />
            <LeadTodosCard leadId={lead.id} todos={todos} />
          </div>
        }
      />

      {enrichModalOpen && (
        <SingleLeadEnrichModal
          leadId={lead.id}
          leadName={lead.company_name}
          defaultConfig={{ ...DEFAULT_ENRICHMENT_CONFIG }}
          serviceMode={serviceMode}
          onClose={() => setEnrichModalOpen(false)}
        />
      )}
    </div>
  );
}
