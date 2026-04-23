import { notFound } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type {
  CustomLeadStatus, Lead, LeadChange, LeadContact, LeadJobPosting, LeadNote, LeadCall, LeadEnrichment,
  EmailMessage,
} from "@/lib/types";
import { ensureLeadCoords } from "@/lib/geo/geocode";
import { getHqLocation } from "@/lib/app-settings";
import { isPhoneMondoConfigured } from "@/lib/phonemondo/client";
import { getWebexCredentials } from "@/lib/webex/auth";
import { listStages } from "@/lib/deals/server";
import { listTeamMembers } from "../../deals/actions";
import type { DealWithRelations } from "@/lib/deals/types";
import { listCaseStudies, listIndustries, listLandingPagesForLead } from "@/lib/landing-pages/server";
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
    { data: emails },
    { data: enrichments },
    { data: changes },
    { data: auditLogs },
    hq,
  ] = await Promise.all([
    db.from("leads").select("*").eq("id", id).is("deleted_at", null).maybeSingle(),
    db.from("custom_lead_statuses").select("*").order("display_order"),
    db.from("lead_contacts").select("*").eq("lead_id", id).order("created_at"),
    db.from("lead_job_postings").select("*").eq("lead_id", id).order("created_at"),
    db.from("lead_notes").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    db.from("lead_calls").select("*").eq("lead_id", id).order("started_at", { ascending: false }),
    db.from("email_messages").select("*").eq("lead_id", id).order("sent_at", { ascending: false }).limit(200),
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
  for (const m of emails ?? []) if (m.sent_by) userIds.add(m.sent_by as string);
  for (const log of auditLogs ?? []) if (log.user_id) userIds.add(log.user_id as string);

  const { data: profileRows } = userIds.size > 0
    ? await db.from("profiles").select("id, name, avatar_url").in("id", Array.from(userIds))
    : { data: [] as { id: string; name: string; avatar_url: string | null }[] };
  const profileById = new Map<string, { name: string; avatarUrl: string | null }>();
  for (const p of profileRows ?? []) {
    profileById.set(p.id as string, {
      name: p.name as string,
      avatarUrl: (p.avatar_url as string | null) ?? null,
    });
  }
  const nameById = new Map<string, string>();
  for (const [id, p] of profileById) nameById.set(id, p.name);

  function withAuthor<T extends { created_by?: string | null }>(
    row: T,
  ): T & { profiles: { name: string; avatar_url: string | null } | null } {
    const p = row.created_by ? profileById.get(row.created_by) : null;
    return {
      ...row,
      profiles: p ? { name: p.name, avatar_url: p.avatarUrl } : null,
    };
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

  // Landing-Pages + Branchen + Case-Studies für den Generator im Lead-Detail
  const [industries, caseStudies, landingPages] = await Promise.all([
    listIndustries(true),
    listCaseStudies(true),
    listLandingPagesForLead(id),
  ]);

  // Deals für diese Firma + Stages + Team für den NewDealDialog
  const [
    { data: dealRows },
    dealStages,
    team,
  ] = await Promise.all([
    db
      .from("deals")
      .select(`
        id, lead_id, title, description, amount_cents, currency, stage_id,
        assigned_to, expected_close_date, actual_close_date,
        probability, next_step, last_followup_at,
        company_name,
        created_by, created_at, updated_at,
        leads(company_name, domain),
        deal_stages!inner(label, color, kind),
        profiles:assigned_to(name, avatar_url)
      `)
      .eq("lead_id", id)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false }),
    listStages(),
    listTeamMembers(),
  ]);

  // Mapping wie in lib/deals/server.ts — inline, um einen zweiten DB-Roundtrip zu sparen.
  function firstOrNull<T>(v: T | T[] | null | undefined): T | null {
    if (!v) return null;
    return Array.isArray(v) ? (v[0] ?? null) : v;
  }
  const deals: DealWithRelations[] = (dealRows ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const lead = firstOrNull(row.leads as { company_name: string; domain: string | null } | { company_name: string; domain: string | null }[] | null);
    const stage = firstOrNull(row.deal_stages as { label: string; color: string; kind: "open" | "won" | "lost" } | { label: string; color: string; kind: "open" | "won" | "lost" }[] | null);
    const profile = firstOrNull(row.profiles as { name: string | null; avatar_url: string | null } | { name: string | null; avatar_url: string | null }[] | null);
    return {
      id: row.id as string,
      leadId: row.lead_id as string,
      title: row.title as string,
      description: (row.description as string | null) ?? null,
      amountCents: row.amount_cents as number,
      currency: row.currency as string,
      stageId: row.stage_id as string,
      assignedTo: (row.assigned_to as string | null) ?? null,
      expectedCloseDate: (row.expected_close_date as string | null) ?? null,
      actualCloseDate: (row.actual_close_date as string | null) ?? null,
      probability: (row.probability as number | null) ?? null,
      nextStep: (row.next_step as string | null) ?? null,
      lastFollowupAt: (row.last_followup_at as string | null) ?? null,
      createdBy: (row.created_by as string | null) ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      company_name: lead?.company_name ?? "—",
      company_domain: lead?.domain ?? null,
      stage_label: stage?.label ?? (row.stage_id as string),
      stage_color: stage?.color ?? "#6b7280",
      stage_kind: stage?.kind ?? "open",
      assignee_name: profile?.name ?? null,
      assignee_avatar_url: profile?.avatar_url ?? null,
    };
  });

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
      emails={((emails ?? []) as EmailMessage[]).map((m) => {
        const p = m.sent_by ? profileById.get(m.sent_by) ?? null : null;
        const c = m.contact_id
          ? ((contacts ?? []) as LeadContact[]).find((x) => x.id === m.contact_id) ?? null
          : null;
        return {
          ...m,
          profiles: p ? { name: p.name, avatar_url: p.avatarUrl } : null,
          contact_name: c?.name ?? null,
        };
      })}
      enrichments={(enrichments ?? []) as LeadEnrichment[]}
      changes={(changes ?? []) as LeadChange[]}
      auditLogs={(auditLogs ?? []).map((log) => {
        const p = log.user_id ? profileById.get(log.user_id as string) ?? null : null;
        return {
          id: log.id as string,
          action: log.action as string,
          details: log.details as Record<string, unknown> | null,
          created_at: log.created_at as string,
          profiles: p ? { name: p.name, avatar_url: p.avatarUrl } : null,
        };
      })}
      statuses={(statuses ?? []) as CustomLeadStatus[]}
      hq={hq}
      senderName={senderName}
      deals={deals}
      dealStages={dealStages}
      team={team}
      industries={industries}
      caseStudies={caseStudies}
      landingPages={landingPages}
    />
  );
}
