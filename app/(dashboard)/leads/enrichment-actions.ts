"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { enrichLead } from "@/lib/enrichment/enrich-lead";
import type { EnrichmentConfig, ServiceMode } from "@/lib/types";

export async function enrichLeadAction(
  leadId: string,
  config?: EnrichmentConfig,
  serviceMode?: ServiceMode,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const result = await enrichLead(leadId, user?.id ?? null, config, serviceMode);

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/crm");
  revalidatePath(`/crm/${leadId}`);

  if (!result.success) {
    return { error: result.error ?? "Anreicherung fehlgeschlagen." };
  }

  return { success: true };
}

export async function abortEnrichment(enrichmentId: string, leadId: string) {
  const db = createServiceClient();

  const { data: enrichment } = await db
    .from("lead_enrichments")
    .select("status")
    .eq("id", enrichmentId)
    .single();

  if (!enrichment) return { error: "Anreicherung nicht gefunden." };
  if (enrichment.status !== "running") return { error: "Anreicherung läuft nicht mehr." };

  const now = new Date().toISOString();

  await db
    .from("lead_enrichments")
    .update({
      status: "failed",
      error_message: "Manuell als fehlgeschlagen markiert (hängender Job)",
      completed_at: now,
    })
    .eq("id", enrichmentId);

  // Lead-Status nur zurücksetzen, wenn er noch auf enrichment_pending steht.
  await db
    .from("leads")
    .update({ status: "imported", updated_at: now })
    .eq("id", leadId)
    .eq("status", "enrichment_pending");

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/crm");
  revalidatePath(`/crm/${leadId}`);

  return { success: true };
}

export async function getEnrichmentData(leadId: string) {
  const db = createServiceClient();

  const [
    { data: contacts },
    { data: jobPostings },
    { data: enrichments },
  ] = await Promise.all([
    db.from("lead_contacts").select("*").eq("lead_id", leadId).order("created_at"),
    db.from("lead_job_postings").select("*").eq("lead_id", leadId).order("created_at"),
    db.from("lead_enrichments").select("*").eq("lead_id", leadId)
      .order("created_at", { ascending: false }).limit(1),
  ]);

  return {
    contacts: contacts ?? [],
    jobPostings: jobPostings ?? [],
    latestEnrichment: enrichments?.[0] ?? null,
  };
}
