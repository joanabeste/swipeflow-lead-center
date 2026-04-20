"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles, AlertTriangle, RotateCcw } from "lucide-react";
import type {
  CustomLeadStatus, Lead, LeadChange, LeadContact, LeadJobPosting, LeadNote, LeadCall, LeadEnrichment,
} from "@/lib/types";
import { DEFAULT_ENRICHMENT_CONFIG } from "@/lib/types";
import type { HqLocation } from "@/lib/app-settings";
import { ResizableColumns } from "@/components/resizable-columns";
import { CrmLeftColumn } from "./crm-left-column";
import { CrmActivityFeed } from "./crm-activity-feed";
import { SingleLeadEnrichModal } from "../../leads/single-lead-enrich-modal";
import { useServiceMode } from "@/lib/service-mode";

type AuthorProfile = { name: string; avatar_url: string | null };
type NoteRow = LeadNote & { profiles: AuthorProfile | null };
type CallRow = LeadCall & { profiles: AuthorProfile | null };
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
  enrichments: LeadEnrichment[];
  changes: LeadChange[];
  auditLogs: AuditRow[];
  statuses: CustomLeadStatus[];
  hq: HqLocation;
  callProviders: { phonemondo: boolean; webex: boolean };
  senderName: string | null;
}

export function CrmLeadDetail({
  lead, contacts, jobs, notes, calls, enrichments, changes, auditLogs, statuses, hq, callProviders, senderName,
}: Props) {
  const { mode: serviceMode } = useServiceMode();
  const [enrichModalOpen, setEnrichModalOpen] = useState(false);
  const [enrichError] = useState<string | null>(null);
  const latestEnrichment = enrichments[0] ?? null;

  function handleEnrich() {
    setEnrichModalOpen(true);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/crm"
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
        </div>
      </div>

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
          />
        }
        right={
          <CrmActivityFeed
            leadId={lead.id}
            leadPhone={lead.phone}
            currentStatusId={lead.crm_status_id}
            statuses={statuses}
            contacts={contacts}
            notes={notes}
            calls={calls}
            enrichments={enrichments}
            changes={changes}
            auditLogs={auditLogs}
            callProviders={callProviders}
          />
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
