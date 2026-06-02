import { notFound } from "next/navigation";
import { LeadProfilePanel } from "../lead-profile-panel";
import { LeadScreenshotCard } from "../_components/lead-screenshot-card";
import { LeadTrafficLightCard } from "../_components/lead-traffic-light-card";
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

  // Ampel-Card für Webdesign-Leads (oder sobald eine Bewertung existiert).
  const showTrafficLight =
    data.lead.vertical === "webdesign" || data.lead.traffic_light_rating != null;

  const rightColumn = (
    <>
      <LeadScreenshotCard
        screenshotPath={data.lead.website_screenshot_path}
        takenAt={data.lead.website_screenshot_taken_at}
        websiteUrl={normalizeWebsiteUrl(data.lead.website)}
      />
      {showTrafficLight && (
        <LeadTrafficLightCard
          leadId={data.lead.id}
          rating={data.lead.traffic_light_rating}
          score={data.lead.traffic_light_score}
          reason={data.lead.traffic_light_reason}
          source={data.lead.traffic_light_source}
          ratedAt={data.lead.traffic_light_rated_at}
        />
      )}
    </>
  );

  return (
    <LeadProfilePanel
      key={data.lead.id}
      lead={data.lead}
      changes={data.changes}
      contacts={data.contacts}
      jobPostings={data.jobPostings}
      latestEnrichment={data.latestEnrichment}
      customStatuses={data.customStatuses}
      hq={data.hq}
      duplicates={data.duplicates}
      backHref={backHref}
      extraRightColumn={rightColumn}
    />
  );
}
