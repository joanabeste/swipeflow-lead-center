import { createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import { fetchCompanyPages } from "./web-fetcher";
import { extractFromPages } from "./extractor";
import { findCompanyWebsite } from "./website-finder";
import { evaluateCancelRules } from "@/lib/cancel-rules/evaluator";
import type { EnrichmentConfig, CancelRule } from "@/lib/types";
import { DEFAULT_ENRICHMENT_CONFIG } from "@/lib/types";

export interface EnrichLeadResult {
  success: boolean;
  error?: string;
  enrichmentId?: string;
  contactsCount?: number;
  jobsCount?: number;
  firstContactName?: string;
  hasEmail?: boolean;
  hasPhone?: boolean;
  cancelled?: boolean;
  cancelReason?: string;
}

export async function enrichLead(
  leadId: string,
  userId: string | null,
  config: EnrichmentConfig = DEFAULT_ENRICHMENT_CONFIG,
): Promise<EnrichLeadResult> {
  const db = createServiceClient();

  // Lead laden
  const { data: lead } = await db
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .single();

  if (!lead) return { success: false, error: "Lead nicht gefunden." };

  let websiteOrDomain = lead.website ?? lead.domain;

  // Wenn keine Website hinterlegt: automatisch suchen
  if (!websiteOrDomain) {
    const foundDomain = await findCompanyWebsite(lead.company_name, lead.city);
    if (foundDomain) {
      websiteOrDomain = foundDomain;
      // Domain im Lead speichern
      await db.from("leads").update({
        domain: foundDomain,
        website: `https://${foundDomain}`,
        updated_at: new Date().toISOString(),
      }).eq("id", leadId);
    } else {
      await db.from("leads").update({
        enrichment_source: "nicht_moeglich:keine_website_gefunden",
        updated_at: new Date().toISOString(),
      }).eq("id", leadId);
      return { success: false, error: `Keine Website für "${lead.company_name}" gefunden.` };
    }
  }

  // Enrichment-Log erstellen
  const { data: enrichment } = await db
    .from("lead_enrichments")
    .insert({
      lead_id: leadId,
      status: "running",
      source: "website",
      config: config as unknown as Record<string, unknown>,
      created_by: userId,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  const enrichmentId = enrichment?.id;

  // Lead-Status auf enrichment_pending setzen
  await db
    .from("leads")
    .update({ status: "enrichment_pending", updated_at: new Date().toISOString() })
    .eq("id", leadId);

  try {
    // 1. Website-Seiten abrufen
    const { pages } = await fetchCompanyPages(websiteOrDomain, config);

    const successfulPages = pages.filter((p) => !p.error);
    if (successfulPages.length === 0) {
      throw new Error("Keine Seiten konnten abgerufen werden.");
    }

    // 2. Claude-Extraktion
    const result = await extractFromPages(lead.company_name, pages, config);

    // 3. Alte Enrichment-Daten löschen (Re-Enrichment) — nur angeforderte Kategorien
    if (config.contacts_management || config.contacts_all) {
      await db.from("lead_contacts").delete().eq("lead_id", leadId);
    }
    if (config.job_postings) {
      await db.from("lead_job_postings").delete().eq("lead_id", leadId);
    }

    // 4. Neue Kontakte einfügen
    if (result.contacts.length > 0) {
      await db.from("lead_contacts").insert(
        result.contacts.map((c) => ({
          lead_id: leadId,
          name: c.name,
          role: c.role,
          email: c.email,
          phone: c.phone,
          source_url: c.source_url,
        })),
      );
    }

    // 5. Neue Stellenanzeigen einfügen
    if (result.job_postings.length > 0) {
      await db.from("lead_job_postings").insert(
        result.job_postings.map((j) => ({
          lead_id: leadId,
          title: j.title,
          url: j.url,
          location: j.location,
          posted_date: j.posted_date,
        })),
      );
    }

    // 6. Lead aktualisieren + Auto-Qualifizierung prüfen
    const leadUpdates: Record<string, unknown> = {
      status: "enriched",
      enriched_at: new Date().toISOString(),
      enrichment_source: "website",
      updated_at: new Date().toISOString(),
    };

    // Zusätzliche Infos in Lead-Felder übernehmen falls leer
    if (!lead.company_size && result.additional_info.company_size_estimate) {
      leadUpdates.company_size = result.additional_info.company_size_estimate;
    }

    // Auto-Qualifizierung: Pflichtfeld-Profil prüfen
    const hasContactWithEmail = result.contacts.some((c) => !!c.email);
    if (hasContactWithEmail) {
      const { data: defaultProfile } = await db
        .from("required_field_profiles")
        .select("required_fields")
        .eq("is_default", true)
        .limit(1)
        .single();

      const updatedLead = { ...lead, ...leadUpdates };
      const requiredFields = (defaultProfile?.required_fields as string[]) ?? ["company_name"];

      const allFieldsFilled = requiredFields.every((field) => {
        const val = updatedLead[field];
        return val != null && String(val).trim() !== "";
      });

      if (allFieldsFilled) {
        leadUpdates.status = "qualified";
      }
    }

    await db.from("leads").update(leadUpdates).eq("id", leadId);

    // 7. Enrichment-Log abschließen
    await db
      .from("lead_enrichments")
      .update({
        status: "completed",
        career_page_url: result.career_page_url,
        raw_response: result as unknown as Record<string, unknown>,
        pages_fetched: pages.map((p) => p.url),
        completed_at: new Date().toISOString(),
      })
      .eq("id", enrichmentId);

    // 8. Post-Enrichment Cancel-Rules prüfen
    let cancelled = false;
    let cancelReason: string | undefined;

    const { data: cancelRules } = await db
      .from("cancel_rules")
      .select("*")
      .eq("is_active", true);

    if (cancelRules && cancelRules.length > 0) {
      // Enrichment-Daten für Cancel-Check aufbereiten
      const enrichedLead: Record<string, unknown> = {
        ...lead,
        ...(leadUpdates.company_size ? { company_size: leadUpdates.company_size } : {}),
        job_postings_count: result.job_postings.length,
        contacts_count: result.contacts.length,
      };

      const cancelResult = evaluateCancelRules(
        enrichedLead,
        cancelRules as CancelRule[],
        "enrichment",
      );

      if (cancelResult.cancelled) {
        cancelled = true;
        cancelReason = cancelResult.reasons.map((r) => r.reason).join("; ");

        await db
          .from("leads")
          .update({
            status: "cancelled",
            cancel_reason: cancelReason,
            cancel_rule_id: cancelResult.reasons[0].ruleId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", leadId);
      }
    }

    // 9. Audit-Log
    await logAudit({
      userId,
      action: cancelled ? "lead.enriched_and_cancelled" : "lead.enriched",
      entityType: "lead",
      entityId: leadId,
      details: {
        contacts_found: result.contacts.length,
        jobs_found: result.job_postings.length,
        career_page: result.career_page_url,
        pages_fetched: successfulPages.length,
        config,
        cancelled,
        cancel_reason: cancelReason,
      },
    });

    const firstContact = result.contacts[0] ?? null;

    return {
      success: true,
      enrichmentId,
      contactsCount: result.contacts.length,
      jobsCount: result.job_postings.length,
      firstContactName: firstContact?.name,
      hasEmail: result.contacts.some((c) => !!c.email),
      hasPhone: result.contacts.some((c) => !!c.phone),
      cancelled,
      cancelReason,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unbekannter Fehler";

    // Enrichment als fehlgeschlagen markieren
    if (enrichmentId) {
      await db
        .from("lead_enrichments")
        .update({
          status: "failed",
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq("id", enrichmentId);
    }

    // Lead-Status zurücksetzen + Fehler vermerken
    await db
      .from("leads")
      .update({
        status: "imported",
        enrichment_source: `fehlgeschlagen:${errorMessage.slice(0, 200)}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId);

    return { success: false, error: errorMessage, enrichmentId };
  }
}
