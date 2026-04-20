"use client";

import type { Lead, LeadContact, LeadJobPosting, LeadEnrichment } from "@/lib/types";
import type { HqLocation } from "@/lib/app-settings";
import { CrmCompanyCard } from "./_components/crm-company-card";
import { CrmContactsCard } from "./_components/crm-contacts-card";
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
}

export function CrmLeftColumn({ lead, contacts, jobs, latestEnrichment, hq, senderName }: Props) {
  return (
    <>
      <CrmCompanyCard lead={lead} latestEnrichment={latestEnrichment} />
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
