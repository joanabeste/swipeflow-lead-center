"use client";

import type { Lead, LeadContact, LeadJobPosting, LeadEnrichment } from "@/lib/types";
import type { HqLocation } from "@/lib/app-settings";
import type { DealStage, DealWithRelations } from "@/lib/deals/types";
import { CrmCompanyCard } from "./_components/crm-company-card";
import { CrmContactsCard } from "./_components/crm-contacts-card";
import { CrmDealsCard } from "./_components/crm-deals-card";
import { CrmJobsCard } from "./_components/crm-jobs-card";
import { CrmLocationMiniCard } from "./_components/crm-location-mini-card";
import { CrmMasterdataForm } from "./_components/crm-masterdata-form";

interface Props {
  lead: Lead;
  contacts: LeadContact[];
  jobs: LeadJobPosting[];
  latestEnrichment: LeadEnrichment | null;
  hq: HqLocation;
  senderName: string | null;
  deals: DealWithRelations[];
  dealStages: DealStage[];
  team: { id: string; name: string; avatarUrl: string | null }[];
}

export function CrmLeftColumn({
  lead, contacts, jobs, latestEnrichment, hq, senderName, deals, dealStages, team,
}: Props) {
  return (
    <>
      <CrmCompanyCard lead={lead} latestEnrichment={latestEnrichment} />
      <CrmDealsCard
        leadId={lead.id}
        companyName={lead.company_name}
        deals={deals}
        stages={dealStages}
        team={team}
      />
      <CrmContactsCard
        leadId={lead.id}
        contacts={contacts}
        jobs={jobs}
        companyName={lead.company_name}
        senderName={senderName}
      />
      <CrmJobsCard leadId={lead.id} jobs={jobs} careerPageUrl={latestEnrichment?.career_page_url ?? null} />
      {lead.latitude != null && lead.longitude != null && (
        <CrmLocationMiniCard lat={lead.latitude} lng={lead.longitude} hq={hq} />
      )}
      <CrmMasterdataForm lead={lead} />
    </>
  );
}
