import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import type {
  CustomLeadStatus,
  Lead,
  LeadContact,
  LeadJobPosting,
  LeadNote,
  LeadCall,
  LeadEnrichment,
} from "@/lib/types";
import { CrmLeadPanel } from "./crm-lead-panel";

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
  ] = await Promise.all([
    db.from("leads").select("*").eq("id", id).single(),
    db.from("custom_lead_statuses").select("*").order("display_order"),
    db.from("lead_contacts").select("*").eq("lead_id", id).order("created_at"),
    db.from("lead_job_postings").select("*").eq("lead_id", id).order("created_at"),
    db.from("lead_notes").select("*, profiles(name, email)").eq("lead_id", id).order("created_at", { ascending: false }),
    db.from("lead_calls").select("*, profiles(name, email)").eq("lead_id", id).order("started_at", { ascending: false }),
    db.from("lead_enrichments").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(1),
  ]);

  if (!lead) notFound();

  return (
    <div>
      <Link
        href="/crm"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Zurück zum CRM
      </Link>

      <CrmLeadPanel
        lead={lead as Lead}
        statuses={(statuses ?? []) as CustomLeadStatus[]}
        contacts={(contacts ?? []) as LeadContact[]}
        jobs={(jobs ?? []) as LeadJobPosting[]}
        notes={(notes ?? []) as (LeadNote & { profiles: { name: string; email: string } | null })[]}
        calls={(calls ?? []) as (LeadCall & { profiles: { name: string; email: string } | null })[]}
        latestEnrichment={((enrichments ?? [])[0] ?? null) as LeadEnrichment | null}
      />
    </div>
  );
}
