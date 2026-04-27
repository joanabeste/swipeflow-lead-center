import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import type { Lead, LeadChange, LeadContact, LeadJobPosting, LeadEnrichment } from "@/lib/types";
import { LeadProfilePanel } from "../lead-profile-panel";
import { ensureLeadCoords } from "@/lib/geo/geocode";
import { getHqLocation } from "@/lib/app-settings";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function LeadDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const from = sp.from ? decodeURIComponent(sp.from) : "";
  const backHref = from ? `/leads?${from}` : "/leads";
  const db = createServiceClient();

  const [
    { data: lead },
    { data: changes },
    { data: contacts },
    { data: jobPostings },
    { data: enrichments },
    hq,
  ] = await Promise.all([
    db.from("leads").select("*").eq("id", id).is("deleted_at", null).maybeSingle(),
    db.from("lead_changes").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    db.from("lead_contacts").select("*").eq("lead_id", id).order("created_at"),
    db.from("lead_job_postings").select("*").eq("lead_id", id).order("created_at"),
    db.from("lead_enrichments").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(1),
    getHqLocation(),
  ]);

  if (!lead) notFound();

  const typedLead = lead as Lead;

  // Geocoding falls noch nicht geschehen und Adresse vorhanden
  if (typedLead.latitude == null || typedLead.longitude == null) {
    const coords = await ensureLeadCoords({
      id: typedLead.id,
      latitude: typedLead.latitude,
      longitude: typedLead.longitude,
      street: typedLead.street,
      zip: typedLead.zip,
      city: typedLead.city,
      country: typedLead.country,
      company_name: typedLead.company_name,
    });
    if (coords) {
      typedLead.latitude = coords.lat;
      typedLead.longitude = coords.lng;
    }
  }

  return (
    <LeadProfilePanel
      lead={typedLead}
      changes={(changes as LeadChange[]) ?? []}
      contacts={(contacts as LeadContact[]) ?? []}
      jobPostings={(jobPostings as LeadJobPosting[]) ?? []}
      latestEnrichment={(enrichments?.[0] as LeadEnrichment) ?? null}
      hq={hq}
      backHref={backHref}
    />
  );
}
