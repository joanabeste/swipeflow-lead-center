import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import type { Lead, LeadChange, LeadContact, LeadJobPosting, LeadEnrichment } from "@/lib/types";
import { LeadProfilePanel } from "../lead-profile-panel";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function LeadDetailPage({ params }: Props) {
  const { id } = await params;
  const db = createServiceClient();

  const [
    { data: lead },
    { data: changes },
    { data: contacts },
    { data: jobPostings },
    { data: enrichments },
  ] = await Promise.all([
    db.from("leads").select("*").eq("id", id).single(),
    db.from("lead_changes").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    db.from("lead_contacts").select("*").eq("lead_id", id).order("created_at"),
    db.from("lead_job_postings").select("*").eq("lead_id", id).order("created_at"),
    db.from("lead_enrichments").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(1),
  ]);

  if (!lead) notFound();

  return (
    <LeadProfilePanel
      lead={lead as Lead}
      changes={(changes as LeadChange[]) ?? []}
      contacts={(contacts as LeadContact[]) ?? []}
      jobPostings={(jobPostings as LeadJobPosting[]) ?? []}
      latestEnrichment={(enrichments?.[0] as LeadEnrichment) ?? null}
    />
  );
}
