import { notFound } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type {
  CustomLeadStatus, Lead, LeadChange, LeadContact, LeadJobPosting, LeadNote, LeadCall, LeadEnrichment,
} from "@/lib/types";
import { ensureLeadCoords } from "@/lib/geo/geocode";
import { getHqLocation } from "@/lib/app-settings";
import { isPhoneMondoConfigured } from "@/lib/phonemondo/client";
import { getWebexCredentials } from "@/lib/webex/auth";
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
    db.from("lead_notes").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    db.from("lead_calls").select("*").eq("lead_id", id).order("started_at", { ascending: false }),
    db.from("lead_enrichments").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(10),
    db.from("lead_changes").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(200),
    db.from("audit_logs")
      .select("id, action, details, created_at, user_id")
      .eq("entity_type", "lead")
      .eq("entity_id", id)
      .in("action", ["lead.crm_status_changed", "lead.bulk_status_update"])
      .order("created_at", { ascending: false })
      .limit(200),
    getHqLocation(),
  ]);

  // Profile-Namen separat laden — lead_notes.created_by verweist auf auth.users, nicht auf profiles,
  // daher kann Supabase den nested Join nicht automatisch auflösen.
  const userIds = new Set<string>();
  for (const n of notes ?? []) if (n.created_by) userIds.add(n.created_by as string);
  for (const c of calls ?? []) if (c.created_by) userIds.add(c.created_by as string);
  for (const log of auditLogs ?? []) if (log.user_id) userIds.add(log.user_id as string);

  const { data: profileRows } = userIds.size > 0
    ? await db.from("profiles").select("id, name").in("id", Array.from(userIds))
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map<string, string>();
  for (const p of profileRows ?? []) nameById.set(p.id, p.name);

  function withAuthor<T extends { created_by?: string | null }>(row: T): T & { profiles: { name: string } | null } {
    const name = row.created_by ? nameById.get(row.created_by) : null;
    return { ...row, profiles: name ? { name } : null };
  }

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

  const webexCreds = await getWebexCredentials();
  const callProviders = {
    phonemondo: isPhoneMondoConfigured(),
    webex: !!webexCreds && (webexCreds.source === "env" || webexCreds.scopes.includes("spark:calls_write")),
  };

  // Name des aktuellen Users für E-Mail-Template-Variable {{sender_name}}
  const supabaseAuth = await createClient();
  const { data: { user: authedUser } } = await supabaseAuth.auth.getUser();
  let senderName: string | null = null;
  if (authedUser) {
    const { data: profile } = await db
      .from("profiles")
      .select("name")
      .eq("id", authedUser.id)
      .single();
    senderName = (profile?.name as string | null) ?? null;
  }

  return (
    <CrmLeadDetail
      lead={typedLead}
      callProviders={callProviders}
      contacts={(contacts ?? []) as LeadContact[]}
      jobs={(jobs ?? []) as LeadJobPosting[]}
      notes={((notes ?? []) as LeadNote[]).map(withAuthor)}
      calls={((calls ?? []) as LeadCall[]).map(withAuthor)}
      enrichments={(enrichments ?? []) as LeadEnrichment[]}
      changes={(changes ?? []) as LeadChange[]}
      auditLogs={(auditLogs ?? []).map((log) => ({
        id: log.id as string,
        action: log.action as string,
        details: log.details as Record<string, unknown> | null,
        created_at: log.created_at as string,
        profiles: log.user_id && nameById.has(log.user_id as string)
          ? { name: nameById.get(log.user_id as string)! }
          : null,
      }))}
      statuses={(statuses ?? []) as CustomLeadStatus[]}
      hq={hq}
      senderName={senderName}
    />
  );
}
