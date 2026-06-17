"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { enrichLead } from "@/lib/enrichment/enrich-lead";
import type { EnrichmentConfig, ServiceMode } from "@/lib/types";
import { bulkUpdateStatus } from "./actions";
import { DEFAULT_QUALIFY_STATUS_BY_MODE } from "@/lib/service-mode-constants";
import { getEnrichmentDefault } from "@/lib/enrichment/defaults";

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

/**
 * Reichert einen Lead an und übernimmt ihn anschließend automatisch ins CRM.
 * Bei technischem Anreicherungsfehler wird NICHT verschoben (Error zurück).
 * Sonst wird IMMER verschoben (Nutzer-Entscheidung) — auch bei rot/ausgeschlossen;
 * forciert status='qualified' + gültige crm_status_id (repariert auch den Fall,
 * dass enrichLead zwar qualifiziert, aber nie eine crm_status_id schreibt).
 */
export async function enrichAndMoveToCrm(
  leadId: string,
  config?: EnrichmentConfig,
  serviceMode: ServiceMode = "recruiting",
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const result = await enrichLead(leadId, user?.id ?? null, config, serviceMode);
  if (!result.success) {
    return { error: result.error ?? "Anreicherung fehlgeschlagen." };
  }

  const move = await bulkUpdateStatus([leadId], "qualified", DEFAULT_QUALIFY_STATUS_BY_MODE[serviceMode]);
  if ("error" in move && move.error) {
    return { error: move.error };
  }

  // bulkUpdateStatus revalidiert bereits /leads + /crm; Detail-Pfade ergänzen.
  revalidatePath(`/leads/${leadId}`);
  revalidatePath(`/crm/${leadId}`);
  return { success: true };
}

/**
 * Qualifiziert einen EINZELNEN Lead aus dem Qualifizierungs-Cockpit und reichert
 * ihn ZUVOR an, falls noch **kein Ansprechpartner ODER keine Telefonnummer**
 * hinterlegt ist — damit nach der CRM-Übernahme ein Kontakt und eine Nummer
 * vorhanden sind. Sind beide schon da, wird direkt verschoben (keine unnötige
 * Anreicherung). `enrichLead` füllt beides: Kontakte (contacts_management) und
 * `leads.phone` (company_phone, sofern in der Whitelist).
 *
 * Anreicherungs-Fehler brechen NICHT ab: der Nutzer hat „qualifizieren" gewollt,
 * der Lead soll auch ohne gefundene Daten ins CRM. Bewusst nur für den Einzel-
 * Weg gedacht (eine Anreicherung pro Aufruf, weit unter dem Funktions-Timeout) —
 * der Bulk-Weg „Alle grünen qualifizieren" bleibt ohne Auto-Anreicherung.
 */
export async function qualifyWithContactEnrichment(
  leadId: string,
  targetStatusId?: string,
  serviceMode: ServiceMode = "webdev",
): Promise<{ success: true; enriched: boolean } | { error: string }> {
  const db = createServiceClient();

  // Lead-Telefon + Ansprechpartner-Anzahl prüfen — anreichern, wenn eines fehlt.
  const [{ data: lead, error: leadErr }, { count, error: countErr }] = await Promise.all([
    db.from("leads").select("phone").eq("id", leadId).maybeSingle(),
    db.from("lead_contacts").select("id", { count: "exact", head: true }).eq("lead_id", leadId),
  ]);
  if (leadErr) return { error: leadErr.message };
  if (countErr) return { error: countErr.message };

  const missingContact = !count;
  const missingPhone = !((lead?.phone as string | null)?.trim());

  let enriched = false;
  if (missingContact || missingPhone) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    // webdev-Default zieht Ansprechpartner (contacts_management) + Firmen-Telefon.
    // Bei Fehler trotzdem weiter zum Verschieben (siehe Doc oben).
    const config = await getEnrichmentDefault(serviceMode);
    const result = await enrichLead(leadId, user?.id ?? null, config, serviceMode);
    enriched = result.success;
  }

  const move = await bulkUpdateStatus([leadId], "qualified", targetStatusId);
  if ("error" in move && move.error) return { error: move.error };

  revalidatePath(`/leads/${leadId}`);
  revalidatePath(`/crm/${leadId}`);
  return { success: true, enriched };
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
