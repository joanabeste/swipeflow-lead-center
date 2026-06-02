import { notFound } from "next/navigation";
import { CrmLeadDetail } from "./crm-lead-detail";
import { LeadScreenshotCard } from "../../leads/_components/lead-screenshot-card";
import { loadCrmDetail } from "@/lib/crm/load-crm-detail";
import { normalizeWebsiteUrl } from "@/lib/website-url";
import { createServiceClient } from "@/lib/supabase/server";
import { findLeadDuplicates } from "@/lib/leads/find-existing";

export default async function CrmLeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const from = sp.from ? decodeURIComponent(sp.from) : "";
  const backHref = from ? `/crm?${from}` : "/crm";

  const data = await loadCrmDetail(id);
  if (!data) notFound();

  // Mutmaßliche Duplikate dieses Leads serverseitig ermitteln — pro Aufruf frisch,
  // also auch direkt nach dem Anreichern (wenn z.B. erst dann die Domain bekannt wurde).
  const duplicates = await findLeadDuplicates(createServiceClient(), {
    id: data.lead.id,
    company_name: data.lead.company_name,
    website: data.lead.website,
    email: data.lead.email,
    phone: data.lead.phone,
    city: data.lead.city,
  });

  const screenshotCard = (
    <LeadScreenshotCard
      screenshotPath={data.lead.website_screenshot_path}
      takenAt={data.lead.website_screenshot_taken_at}
      websiteUrl={normalizeWebsiteUrl(data.lead.website)}
    />
  );

  return (
    <CrmLeadDetail
      lead={data.lead}
      screenshotCard={screenshotCard}
      callProviders={data.callProviders}
      contacts={data.contacts}
      jobs={data.jobs}
      notes={data.notes}
      calls={data.calls}
      emails={data.emails}
      enrichments={data.enrichments}
      changes={data.changes}
      auditLogs={data.auditLogs}
      statuses={data.statuses}
      hq={data.hq}
      senderName={data.senderName}
      deals={data.deals}
      dealStages={data.dealStages}
      team={data.team}
      industries={data.industries}
      caseStudies={data.caseStudies}
      landingPages={data.landingPages}
      todos={data.todos}
      duplicates={duplicates}
      backHref={backHref}
    />
  );
}
