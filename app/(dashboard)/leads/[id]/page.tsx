import { notFound } from "next/navigation";
import { LeadProfilePanel } from "../lead-profile-panel";
import { LeadScreenshotCard } from "../_components/lead-screenshot-card";
import { loadLeadDetail } from "@/lib/leads/load-lead-detail";
import { normalizeWebsiteUrl } from "@/lib/website-url";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function LeadDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const from = sp.from ? decodeURIComponent(sp.from) : "";
  const backHref = from ? `/leads?${from}` : "/leads";

  const data = await loadLeadDetail(id);
  if (!data) notFound();

  const screenshotCard = (
    <LeadScreenshotCard
      screenshotPath={data.lead.website_screenshot_path}
      takenAt={data.lead.website_screenshot_taken_at}
      websiteUrl={normalizeWebsiteUrl(data.lead.website)}
    />
  );

  return (
    <LeadProfilePanel
      lead={data.lead}
      changes={data.changes}
      contacts={data.contacts}
      jobPostings={data.jobPostings}
      latestEnrichment={data.latestEnrichment}
      customStatuses={data.customStatuses}
      hq={data.hq}
      backHref={backHref}
      extraRightColumn={screenshotCard}
    />
  );
}
