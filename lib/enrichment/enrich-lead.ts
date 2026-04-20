import { createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import { fetchCompanyPages } from "./web-fetcher";
import { extractFromPages } from "./extractor";
import { findCompanyWebsite } from "./website-finder";
import { analyzeWebsite } from "./website-analyzer";
import { getWebdevScoringConfig } from "./webdev-scoring";
import { getRecruitingScoringConfig, isHrContact } from "./recruiting-scoring";
import { evaluateCancelRules } from "@/lib/cancel-rules/evaluator";
import { guessSalutationFromName } from "@/lib/contacts/salutation-from-name";
import type { EnrichmentConfig, CancelRule, ServiceMode } from "@/lib/types";
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
  websiteIssues?: number;
  hasSsl?: boolean;
  isMobile?: boolean;
  websiteTech?: string;
  designEstimate?: string;
  cancelled?: boolean;
  cancelReason?: string;
}

export async function enrichLead(
  leadId: string,
  userId: string | null,
  config: EnrichmentConfig = DEFAULT_ENRICHMENT_CONFIG,
  serviceMode: ServiceMode = "recruiting",
): Promise<EnrichLeadResult> {
  const db = createServiceClient();

  // Lead laden
  const { data: lead } = await db
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .single();

  if (!lead) return { success: false, error: "Lead nicht gefunden." };

  // Homepage extrahieren — wenn website eine Sub-URL ist (z.B. /karriere),
  // nimm die Domain als Ausgangspunkt. Alte Daten haben das oft falsch.
  function rootFromUrl(url: string): string | null {
    const m = url.match(/^(https?:\/\/[^/?#]+)/i);
    return m ? m[1] : null;
  }
  const looksLikeSubpage = (url: string | null) =>
    !!url && /^https?:\/\/[^/]+\/.+/i.test(url);

  let websiteOrDomain: string | null = null;
  if (lead.domain) {
    websiteOrDomain = lead.domain;
  } else if (lead.website) {
    // Falls website-Feld eine Unterseite enthält → Root extrahieren
    const root = looksLikeSubpage(lead.website) ? rootFromUrl(lead.website) : lead.website;
    websiteOrDomain = root ?? lead.website;
  }

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
    // Webdev-Modus: Website-Analyse durchführen
    let websiteAnalysis: Awaited<ReturnType<typeof analyzeWebsite>> | null = null;
    const webdevScoring = serviceMode === "webdev" ? await getWebdevScoringConfig() : null;
    if (serviceMode === "webdev" && webdevScoring) {
      websiteAnalysis = await analyzeWebsite(websiteOrDomain, webdevScoring);
      // Ergebnisse im Lead speichern
      await db.from("leads").update({
        has_ssl: websiteAnalysis.hasSsl,
        is_mobile_friendly: websiteAnalysis.isMobileFriendly,
        page_speed_score: Math.min(100, Math.round((1 - websiteAnalysis.loadTimeMs / 10000) * 100)),
        website_tech: websiteAnalysis.technology,
        website_age_estimate: websiteAnalysis.designEstimate,
        website_issues: websiteAnalysis.issues,
      }).eq("id", leadId);
    }

    // Config wird 1:1 vom Modal übernommen — Defaults werden dort basierend auf
    // dem Service-Modus aus enrichment_defaults geladen.

    // 1. Website-Seiten abrufen — bekannte Karriere-URL als Hint
    const fetchStart = Date.now();
    const { pages } = await fetchCompanyPages(websiteOrDomain, config, lead.career_page_url ?? undefined);
    const fetchMs = Date.now() - fetchStart;

    const successfulPages = pages.filter((p) => !p.error);
    if (successfulPages.length === 0) {
      throw new Error("Keine Seiten konnten abgerufen werden.");
    }

    // 2. LLM-Extraktion (Kontakte + Firmendaten)
    const result = await extractFromPages(lead.company_name, pages, config);

    // 3. Alte Enrichment-Daten löschen (Re-Enrichment) — nur KI-Ergebnisse, keine Import-Daten
    if (config.contacts_management || config.contacts_hr || config.contacts_all) {
      await db.from("lead_contacts").delete().eq("lead_id", leadId);
    }
    if (config.job_postings) {
      // NUR Enrichment-Jobs löschen. BA-Import- und manuelle Jobs bleiben erhalten!
      await db.from("lead_job_postings")
        .delete()
        .eq("lead_id", leadId)
        .eq("source", "enrichment");
    }

    // 4. Neue Kontakte einfügen.
    // Salutation: primär aus LLM-Extraktion, Fallback aus Namens-Heuristik.
    if (result.contacts.length > 0) {
      await db.from("lead_contacts").insert(
        result.contacts.map((c) => ({
          lead_id: leadId,
          name: c.name,
          role: c.role,
          email: c.email,
          phone: c.phone,
          salutation: c.salutation ?? guessSalutationFromName(c.name),
          source_url: c.source_url,
        })),
      );
    }

    // 5. Neue Stellenanzeigen einfügen — upsert verhindert Dubletten mit BA-Import
    if (result.job_postings.length > 0) {
      const jobsToInsert = result.job_postings.map((j) => ({
        lead_id: leadId,
        title: j.title,
        url: j.url,
        location: j.location,
        posted_date: j.posted_date,
        source: "enrichment" as const,
      }));
      // Ohne URL: normaler insert (Unique-Index greift nur bei url IS NOT NULL)
      const withUrl = jobsToInsert.filter((j) => j.url);
      const withoutUrl = jobsToInsert.filter((j) => !j.url);
      if (withUrl.length > 0) {
        await db.from("lead_job_postings").upsert(withUrl, {
          onConflict: "lead_id,url",
          ignoreDuplicates: true,
        });
      }
      if (withoutUrl.length > 0) {
        await db.from("lead_job_postings").insert(withoutUrl);
      }
    }

    // 6. Lead aktualisieren + Auto-Qualifizierung prüfen
    // Cancel-Felder zurücksetzen — falls nachher die Cancel-Rule wieder matcht,
    // werden sie unten erneut gesetzt. So bleibt kein veralteter Grund stehen.
    // Wichtig: bereits qualified/exported-Leads NICHT auf "enriched" zurückfallen
    // lassen — sie sind im CRM und werden dort manuell gepflegt.
    const keepCurrentStatus = lead.status === "qualified" || lead.status === "exported";
    const leadUpdates: Record<string, unknown> = {
      status: keepCurrentStatus ? lead.status : "enriched",
      enriched_at: new Date().toISOString(),
      enrichment_source: "website",
      cancel_reason: null,
      cancel_rule_id: null,
      updated_at: new Date().toISOString(),
    };

    // Zusätzliche Infos in Lead-Felder übernehmen — nur wenn im Lead noch leer
    // UND nur wenn das Feld Teil der Whitelist ist (falls gesetzt)
    const ai = result.additional_info;
    const allowlist = config.company_details_fields; // undefined = alle erlaubt
    const isFieldAllowed = (group: import("@/lib/types").CompanyDetailField) =>
      !allowlist || allowlist.includes(group);

    const fillIfEmpty = (field: string, value: string | null | undefined) => {
      if (!(lead as Record<string, unknown>)[field] && value) leadUpdates[field] = value;
    };

    if (isFieldAllowed("company_size")) fillIfEmpty("company_size", ai.company_size_estimate);
    if (isFieldAllowed("phone")) fillIfEmpty("phone", ai.company_phone);
    if (isFieldAllowed("email")) fillIfEmpty("email", ai.company_email);
    if (isFieldAllowed("address")) {
      fillIfEmpty("street", ai.street);
      fillIfEmpty("zip", ai.zip);
      fillIfEmpty("city", ai.city);
      fillIfEmpty("state", ai.state);
    }
    if (isFieldAllowed("legal_form")) fillIfEmpty("legal_form", ai.legal_form);
    if (isFieldAllowed("register_id")) fillIfEmpty("register_id", ai.register_id);

    // Karriereseite ins dedizierte Feld — vom Extraktor oder vom bisherigen Lead (Alt-Datensätze)
    if (!lead.career_page_url) {
      if (result.career_page_url) {
        leadUpdates.career_page_url = result.career_page_url;
      } else if (looksLikeSubpage(lead.website)) {
        // Alt-Daten: website war eine Karriere-Unterseite → ins neue Feld verschieben
        leadUpdates.career_page_url = lead.website;
      }
    }

    // Website-Feld auf Homepage korrigieren falls dort noch eine Sub-URL steht
    if (looksLikeSubpage(lead.website)) {
      const root = rootFromUrl(lead.website!);
      if (root) leadUpdates.website = root;
    }

    // Tatsächliche Counts aus DB — inklusive BA-Import & manuelle Einträge.
    // Werden sowohl für Auto-Qualifizierung als auch für Cancel-Rules verwendet.
    const [{ count: totalJobsCount }, { count: totalContactsCount }] = await Promise.all([
      db.from("lead_job_postings").select("id", { count: "exact", head: true }).eq("lead_id", leadId),
      db.from("lead_contacts").select("id", { count: "exact", head: true }).eq("lead_id", leadId),
    ]);
    const totalJobs = totalJobsCount ?? 0;
    const totalContacts = totalContactsCount ?? 0;

    // Auto-Qualifizierung nur für Leads, die noch nicht im CRM sind.
    // Bereits qualified/exported-Leads werden vom Re-Enrich nur datenseitig
    // aktualisiert, ihr Status bleibt unverändert.
    if (keepCurrentStatus) {
      // skip — Status bleibt wie er war
    } else if (serviceMode === "webdev") {
      // Webdev: Qualifiziert wenn Kontakt da + genügend Issues laut Scoring-Schwellwert
      const hasContact = result.contacts.some((c) => !!c.email || !!c.phone);
      const minIssues = webdevScoring?.min_issues_to_qualify ?? 1;
      const issueCount = websiteAnalysis?.issues.length ?? 0;
      if (hasContact && issueCount >= minIssues) {
        leadUpdates.status = "qualified";
      }
    } else {
      // Recruiting: Qualifiziert wenn Scoring-Kriterien UND Pflichtfelder erfüllt
      const scoring = await getRecruitingScoringConfig();

      const hasContactWithEmail = result.contacts.some((c) => !!c.email);
      const hasAnyContact = result.contacts.length > 0;
      const hasHrContact = result.contacts.some((c) => isHrContact(c.role));
      // BA-importierte Stellen mitzählen — LLM-Treffer allein wäre zu eng.
      const jobsCount = totalJobs;

      const contactOk = scoring.require_contact_email ? hasContactWithEmail : hasAnyContact;
      const hrOk = !scoring.require_hr_contact || hasHrContact;
      const jobsOk = jobsCount >= scoring.min_job_postings_to_qualify;

      if (contactOk && hrOk && jobsOk) {
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
    }

    await db.from("leads").update(leadUpdates).eq("id", leadId);

    // 7. Enrichment-Log abschließen — inkl. Phasen-Latenz und Token-Counts
    await db
      .from("lead_enrichments")
      .update({
        status: "completed",
        career_page_url: result.career_page_url,
        raw_response: result as unknown as Record<string, unknown>,
        pages_fetched: pages.map((p) => p.url),
        completed_at: new Date().toISOString(),
        fetch_ms: fetchMs,
        llm_ms: result.meta.llmMs,
        input_chars: result.meta.inputChars,
        prompt_tokens: result.meta.promptTokens,
        completion_tokens: result.meta.completionTokens,
      })
      .eq("id", enrichmentId);

    // 8. Post-Enrichment Cancel-Rules prüfen (nur im passenden Modus)
    let cancelled = false;
    let cancelReason: string | undefined;

    // Leads die bereits qualified/exported sind, dürfen durch ein Re-Enrichment
    // NICHT mehr automatisch gecancelt werden — sie sind im CRM und werden dort
    // manuell gepflegt. Der Re-Enrich-Flow dient nur zum Nachholen von Daten.
    const skipCancelRules =
      lead.status === "qualified" ||
      lead.status === "exported" ||
      lead.crm_status_id != null;

    // Im Webdev-Modus: Keine Recruiting-spezifischen Cancel-Rules anwenden
    // (z.B. "Keine offenen Stellen" ist irrelevant für Webentwicklung)
    if (serviceMode === "recruiting" && !skipCancelRules) {
    const { data: cancelRules } = await db
      .from("cancel_rules")
      .select("*")
      .eq("is_active", true);

    if (cancelRules && cancelRules.length > 0) {
      console.log("[CANCEL_CHECK]", lead.company_name, "leadId:", leadId,
        "totalJobs:", totalJobs, "totalContacts:", totalContacts,
        "llm_jobs:", result.job_postings.length, "llm_contacts:", result.contacts.length);

      // Enrichment-Daten für Cancel-Check aufbereiten — Counts inkl. BA-Import.
      const enrichedLead: Record<string, unknown> = {
        ...lead,
        ...(leadUpdates.company_size ? { company_size: leadUpdates.company_size } : {}),
        job_postings_count: totalJobs,
        contacts_count: totalContacts,
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
    } // Ende: serviceMode === "recruiting" Cancel-Rules Block

    // 9. Audit-Log
    await logAudit({
      userId,
      action: cancelled ? "lead.enriched_and_cancelled" : "lead.enriched",
      entityType: "lead",
      entityId: leadId,
      details: {
        contacts_found: totalContacts,
        contacts_from_llm: result.contacts.length,
        jobs_found: totalJobs,
        jobs_from_llm: result.job_postings.length,
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
      contactsCount: totalContacts,
      jobsCount: totalJobs,
      firstContactName: firstContact?.name,
      hasEmail: result.contacts.some((c) => !!c.email),
      hasPhone: result.contacts.some((c) => !!c.phone),
      websiteIssues: websiteAnalysis?.issues.length ?? 0,
      hasSsl: websiteAnalysis?.hasSsl,
      isMobile: websiteAnalysis?.isMobileFriendly,
      websiteTech: websiteAnalysis?.technology ?? undefined,
      designEstimate: websiteAnalysis?.designEstimate,
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
