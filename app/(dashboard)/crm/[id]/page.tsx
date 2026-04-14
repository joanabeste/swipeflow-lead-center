import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import type {
  CustomLeadStatus, Lead, LeadChange, LeadContact, LeadJobPosting, LeadNote, LeadCall, LeadEnrichment,
} from "@/lib/types";
import { ensureLeadCoords } from "@/lib/geo/geocode";
import { getHqLocation } from "@/lib/app-settings";
import { CrmLeadDetail } from "./crm-lead-detail";

export default async function CrmLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createServiceClient();

  const [
    { data: lead },
    { data: statuses },
    { data: contacts },
    { data: jobs },
    { data: notes },
    { data: calls },
    { data: enrichments },
    { data: changes },
    { data: auditLogs },
    hq,
  ] = await Promise.all([
    db.from("leads").select("*").eq("id", id).single(),
    db.from("custom_lead_statuses").select("*").order("display_order"),
    db.from("lead_contacts").select("*").eq("lead_id", id).order("created_at"),
    db.from("lead_job_postings").select("*").eq("lead_id", id).order("created_at"),
    db.from("lead_notes").select("*, profiles(name)").eq("lead_id", id).order("created_at", { ascending: false }),
    db.from("lead_calls").select("*, profiles(name)").eq("lead_id", id).order("started_at", { ascending: false }),
    db.from("lead_enrichments").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(10),
    db.from("lead_changes").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(200),
    db.from("audit_logs")
      .select("id, action, details, created_at, profiles(name)")
      .eq("entity_type", "lead")
      .eq("entity_id", id)
      .in("action", [
        "lead.crm_status_changed",
        "lead.bulk_status_update",
      ])
      .order("created_at", { ascending: false })
      .limit(200),
    getHqLocation(),
  ]);

  if (!lead) notFound();
  const typedLead = lead as Lead;

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
    <CrmLeadDetail
      lead={typedLead}
      contacts={(contacts ?? []) as LeadContact[]}
      jobs={(jobs ?? []) as LeadJobPosting[]}
      notes={(notes ?? []) as (LeadNote & { profiles: { name: string } | null })[]}
      calls={(calls ?? []) as (LeadCall & { profiles: { name: string } | null })[]}
      enrichments={(enrichments ?? []) as LeadEnrichment[]}
      changes={(changes ?? []) as LeadChange[]}
      auditLogs={(auditLogs ?? []).map((log) => ({
        id: log.id,
        action: log.action,
        details: log.details,
        created_at: log.created_at,
        profiles: Array.isArray(log.profiles)
          ? (log.profiles[0] ?? null)
          : log.profiles,
      }))}
      statuses={(statuses ?? []) as CustomLeadStatus[]}
      hq={hq}
    />
  );
}
