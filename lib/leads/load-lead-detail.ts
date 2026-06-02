import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { Lead, LeadChange, LeadContact, LeadJobPosting, LeadEnrichment, CustomLeadStatus } from "@/lib/types";
import { getHqLocation, type HqLocation } from "@/lib/app-settings";
import { findLeadDuplicates, type DuplicateCandidate } from "@/lib/leads/find-existing";

export interface LeadDetailBundle {
  lead: Lead;
  changes: LeadChange[];
  contacts: LeadContact[];
  jobPostings: LeadJobPosting[];
  latestEnrichment: LeadEnrichment | null;
  customStatuses: CustomLeadStatus[];
  hq: HqLocation;
  /** Mutmaßliche Duplikate dieses Leads — für das Warnbanner in der Neue-Leads-Ansicht. */
  duplicates: DuplicateCandidate[];
}

/**
 * Laedt das vollstaendige Daten-Bundle fuer die Neue-Leads-Detailansicht.
 * Wird sowohl von der dedizierten Page (`/leads/[id]`) als auch vom
 * Preview-Drawer-Endpoint (`/api/leads/[id]/preview`) genutzt.
 *
 * Liefert null, wenn der Lead nicht existiert oder soft-deleted ist.
 *
 * Hot-path-Optimierung: Geocoding (Nominatim, bis zu 4 s) und das Signieren
 * der Screenshot-URL (Supabase-Storage-Roundtrip) sind **nicht** mehr Teil
 * dieser Funktion — beides wird vom Client lazy nachgezogen ueber
 * `/api/leads/[id]/geocode` bzw. `/api/leads/[id]/screenshot-url`.
 */
export async function loadLeadDetail(id: string): Promise<LeadDetailBundle | null> {
  const db = createServiceClient();

  const [
    { data: lead },
    { data: changes },
    { data: contacts },
    { data: jobPostings },
    { data: enrichments },
    { data: customStatuses },
    hq,
  ] = await Promise.all([
    db.from("leads").select("*").eq("id", id).is("deleted_at", null).maybeSingle(),
    db.from("lead_changes").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(50),
    db.from("lead_contacts").select("*").eq("lead_id", id).order("created_at"),
    db.from("lead_job_postings").select("*").eq("lead_id", id).order("created_at"),
    db.from("lead_enrichments").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(1),
    db.from("custom_lead_statuses").select("*"),
    getHqLocation(),
  ]);

  if (!lead) return null;
  const typedLead = lead as Lead;

  // Mutmaßliche Duplikate (vollumfänglich: Domain/E-Mail/Telefon/Name, beide Seiten
  // normalisiert) — pro Aufruf frisch, also auch nach dem Anreichern.
  const duplicates = await findLeadDuplicates(db, {
    id: typedLead.id,
    company_name: typedLead.company_name,
    website: typedLead.website,
    email: typedLead.email,
    phone: typedLead.phone,
    city: typedLead.city,
  });

  return {
    lead: typedLead,
    changes: (changes as LeadChange[]) ?? [],
    contacts: (contacts as LeadContact[]) ?? [],
    jobPostings: (jobPostings as LeadJobPosting[]) ?? [],
    latestEnrichment: (enrichments?.[0] as LeadEnrichment) ?? null,
    customStatuses: (customStatuses as CustomLeadStatus[]) ?? [],
    hq,
    duplicates,
  };
}
