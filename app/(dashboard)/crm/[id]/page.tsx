import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import type {
  CustomLeadStatus, Lead, LeadChange, LeadContact, LeadJobPosting, LeadNote, LeadCall, LeadEnrichment,
} from "@/lib/types";
import { ensureLeadCoords } from "@/lib/geo/geocode";
import { getHqLocation } from "@/lib/app-settings";
import { LeadProfilePanel, type ActivityItem } from "../../leads/lead-profile-panel";
import { CrmSidePanel } from "./crm-side-panel";
import { CrmStatusHeader } from "./crm-status-header";

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
    db.from("lead_enrichments").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(5),
    db.from("lead_changes").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(100),
    db.from("audit_logs")
      .select("*, profiles(name)")
      .eq("entity_type", "lead")
      .eq("entity_id", id)
      .in("action", [
        "lead.crm_status_changed",
        "lead.enriched",
        "lead.enriched_and_cancelled",
        "lead.bulk_status_update",
      ])
      .order("created_at", { ascending: false })
      .limit(100),
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

  const typedStatuses = (statuses ?? []) as CustomLeadStatus[];
  const typedContacts = (contacts ?? []) as LeadContact[];
  const typedCalls = (calls ?? []) as (LeadCall & { profiles: { name: string } | null })[];
  const typedNotes = (notes ?? []) as (LeadNote & { profiles: { name: string } | null })[];
  const typedChanges = (changes ?? []) as LeadChange[];
  const typedEnrichments = (enrichments ?? []) as LeadEnrichment[];
  const typedAudit = (auditLogs ?? []) as Array<{
    id: string; action: string; details: Record<string, unknown> | null;
    created_at: string; profiles: { name: string } | null;
  }>;

  // Timeline aus allen Quellen mischen
  const items: ActivityItem[] = [];
  for (const call of typedCalls) {
    const directionLabel = call.direction === "inbound" ? "Eingehender Anruf" : "Ausgehender Anruf";
    const statusLabel: Record<string, string> = {
      initiated: "initiiert", ringing: "klingelt", answered: "angenommen",
      missed: "nicht erreicht", failed: "fehlgeschlagen", ended: "beendet",
    };
    const dur = call.duration_seconds ? ` · ${formatDur(call.duration_seconds)}` : "";
    items.push({
      id: `call-${call.id}`,
      kind: "call",
      at: call.started_at,
      title: `${directionLabel} — ${statusLabel[call.status] ?? call.status}${dur}`,
      detail: call.notes ?? undefined,
      meta: call.profiles?.name ?? undefined,
    });
  }
  for (const n of typedNotes) {
    items.push({
      id: `note-${n.id}`,
      kind: "note",
      at: n.created_at,
      title: "Notiz",
      detail: n.content,
      meta: n.profiles?.name ?? undefined,
    });
  }
  for (const e of typedEnrichments) {
    if (!e.completed_at) continue;
    items.push({
      id: `enrichment-${e.id}`,
      kind: "enrichment",
      at: e.completed_at,
      title: e.status === "completed" ? "Angereichert" : `Enrichment: ${e.status}`,
      detail: e.error_message ?? undefined,
    });
  }
  for (const log of typedAudit) {
    if (log.action === "lead.crm_status_changed") {
      const newId = (log.details?.new_status as string | null) ?? null;
      const oldId = (log.details?.old_status as string | null) ?? null;
      const newLabel = typedStatuses.find((s) => s.id === newId)?.label ?? newId ?? "–";
      const oldLabel = typedStatuses.find((s) => s.id === oldId)?.label ?? oldId ?? "–";
      items.push({
        id: `audit-${log.id}`,
        kind: "crm_status",
        at: log.created_at,
        title: `CRM-Status: ${oldLabel} → ${newLabel}`,
        meta: log.profiles?.name ?? undefined,
      });
    } else if (log.action === "lead.bulk_status_update") {
      items.push({
        id: `audit-${log.id}`,
        kind: "status",
        at: log.created_at,
        title: `Pipeline-Status → ${log.details?.new_status ?? "?"}`,
        meta: log.profiles?.name ?? undefined,
      });
    }
  }
  for (const ch of typedChanges) {
    items.push({
      id: `change-${ch.id}`,
      kind: "change",
      at: ch.created_at,
      title: `${ch.field_name}: ${ch.old_value ?? "–"} → ${ch.new_value ?? "–"}`,
    });
  }
  items.sort((a, b) => (a.at < b.at ? 1 : -1));

  const latestEnrichment = typedEnrichments[0] ?? null;

  return (
    <LeadProfilePanel
      lead={typedLead}
      changes={typedChanges}
      contacts={typedContacts}
      jobPostings={(jobs ?? []) as LeadJobPosting[]}
      latestEnrichment={latestEnrichment}
      hq={hq}
      backHref="/crm"
      backLabel="Zurück zum CRM"
      headerExtras={
        <CrmStatusHeader
          leadId={typedLead.id}
          currentStatusId={typedLead.crm_status_id}
          statuses={typedStatuses}
        />
      }
      extraRightColumn={
        <CrmSidePanel
          leadId={typedLead.id}
          leadPhone={typedLead.phone}
          contacts={typedContacts}
        />
      }
      activityItems={items}
      resizableRightColumn
      resizeStorageKey="crm-right-width"
    />
  );
}

function formatDur(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")} min`;
}
