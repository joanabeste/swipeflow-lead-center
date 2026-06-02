import { createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import { fetchCompanyPages } from "./web-fetcher";
import { extractFromPages } from "./extractor";
import { findCompanyWebsite } from "./website-finder";
import { verifyDomainOwnership } from "./domain-verifier";
import { analyzeWebsite } from "./website-analyzer";
import { getWebdevScoringConfig } from "./webdev-scoring";
import { getRecruitingScoringConfig, isHrContact } from "./recruiting-scoring";
import { evaluateCancelRules } from "@/lib/cancel-rules/evaluator";
import { guessSalutation } from "@/lib/contacts/salutation-from-name";
import { insertPhoneSwapNote } from "@/lib/leads/merge-note";
import { normalizePhone } from "@/lib/csv/normalizer";
import { buildFactorSnapshot, type FactorSnapshot } from "./quality-score";
import { evaluateTrafficLight, type TrafficLightResult } from "./traffic-light";
import type { EnrichmentConfig, CancelRule, ServiceMode, TrafficLightRating } from "@/lib/types";
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
  trafficLight?: TrafficLightRating;
  trafficLightReason?: string;
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

  // ── KI-Ampel-Bewertung (Webdesign) — opt-in, manuelle Korrektur respektieren ──
  const wantTrafficLight =
    serviceMode === "webdev" &&
    config.traffic_light_rating === true &&
    (lead as { traffic_light_source?: string | null }).traffic_light_source !== "manual";

  // Schreibt das Ampel-Ergebnis in einem eigenen Update — robust gegen spätere
  // Fehler im Enrichment-Flow (z.B. „keine Seiten erreichbar"), damit das Rating
  // (oft gerade bei inaktiven/toten Seiten = rot) erhalten bleibt.
  const writeTrafficLight = async (tl: TrafficLightResult | null) => {
    if (!tl) return;
    await db.from("leads").update({
      traffic_light_rating: tl.rating,
      traffic_light_score: tl.score,
      traffic_light_reason: tl.reason,
      traffic_light_rated_at: new Date().toISOString(),
      traffic_light_source: "ai",
    }).eq("id", leadId);
  };

  // Leads ganz ohne Website: KI entscheidet rein anhand der Firmeninfos.
  const rateNoWebsite = async () => {
    if (!wantTrafficLight) return;
    try {
      const tl = await evaluateTrafficLight({
        companyName: lead.company_name,
        website: null,
        description: lead.description ?? null,
        screenshotBuffer: null,
        signals: {
          designScore: null, ageEstimate: null, issues: [], visualIssues: [],
          hasSsl: null, isMobileFriendly: null, technology: null,
          statusCode: null, pageTitle: null, metaDescription: null,
        },
      });
      await writeTrafficLight(tl);
    } catch {
      // Ampel darf den Flow nie kippen
    }
  };

  let websiteOrDomain: string | null = lead.website ?? null;

  // Wenn keine Website hinterlegt: automatisch suchen UND verifizieren.
  // Discovery alleine ist nicht genug — Suchmaschinen + LLM-Disambiguation
  // koennen falsche Domains liefern (parked, Fremdfirma, gleichlautend).
  // Wir uebernehmen nur, wenn Impressum/Homepage Firmennamen-Token UND
  // Ort/PLZ enthalten (verifyDomainOwnership).
  if (!websiteOrDomain) {
    const foundDomain = await findCompanyWebsite(lead.company_name, lead.city);
    if (foundDomain) {
      const verification = await verifyDomainOwnership(
        foundDomain,
        lead.company_name,
        lead.city,
        lead.zip,
      );
      if (verification.verified) {
        websiteOrDomain = foundDomain;
        await db.from("leads").update({
          website: foundDomain,
          enrichment_source: `auto_discovered_verified:${verification.score}:${verification.evidence.join("|")}`,
          updated_at: new Date().toISOString(),
        }).eq("id", leadId);
      } else {
        await db.from("leads").update({
          enrichment_source: `nicht_moeglich:domain_unverifiziert:${foundDomain}:score=${verification.score}`,
          updated_at: new Date().toISOString(),
        }).eq("id", leadId);
        await rateNoWebsite();
        return {
          success: false,
          error: `Domain-Kandidat "${foundDomain}" konnte nicht als zur Firma "${lead.company_name}" gehoerend verifiziert werden (Score ${verification.score}/9).`,
        };
      }
    } else {
      await db.from("leads").update({
        enrichment_source: "nicht_moeglich:keine_website_gefunden",
        updated_at: new Date().toISOString(),
      }).eq("id", leadId);
      await rateNoWebsite();
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

  // Lead-Status auf enrichment_pending setzen + Versuchs-Counter
  await db
    .from("leads")
    .update({
      status: "enrichment_pending",
      enrichment_attempt_count: (lead.enrichment_attempt_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  try {
    // Webdev-Modus: Website-Analyse durchführen
    let websiteAnalysis: Awaited<ReturnType<typeof analyzeWebsite>> | null = null;
    const webdevScoring = serviceMode === "webdev" ? await getWebdevScoringConfig() : null;
    if (serviceMode === "webdev" && webdevScoring) {
      // Pro-Run Override: capture_screenshot=true im Anreicherungs-Modal erzwingt
      // den Visual-Pfad, auch wenn das gespeicherte Scoring textbasiert läuft.
      // Die Ampel-Bewertung ist stark visuell → erzwingt ebenfalls einen Screenshot,
      // damit die KI das Design beurteilen kann.
      const wantScreenshot = config.capture_screenshot || config.traffic_light_rating;
      const effectiveScoring = wantScreenshot
        ? { ...webdevScoring, screenshot_visual_analysis: true }
        : webdevScoring;
      websiteAnalysis = await analyzeWebsite(websiteOrDomain, effectiveScoring, leadId);
      // Ergebnisse im Lead speichern — inkl. neuer Qualitaets-Felder
      await db.from("leads").update({
        has_ssl: websiteAnalysis.hasSsl,
        is_mobile_friendly: websiteAnalysis.isMobileFriendly,
        page_speed_score: Math.min(100, Math.round((1 - websiteAnalysis.loadTimeMs / 10000) * 100)),
        website_tech: websiteAnalysis.technology,
        website_age_estimate: websiteAnalysis.designEstimate,
        website_issues: websiteAnalysis.issues,
        website_screenshot_path: websiteAnalysis.screenshotPath,
        website_screenshot_taken_at: websiteAnalysis.screenshotTakenAt,
        website_status_code: websiteAnalysis.statusCode,
        website_final_url: websiteAnalysis.finalUrl,
        website_html_size_bytes: websiteAnalysis.htmlSizeBytes,
        website_page_title: websiteAnalysis.pageTitle,
        website_meta_description: websiteAnalysis.metaDescription,
        website_language: websiteAnalysis.language,
        website_has_impressum: websiteAnalysis.hasImpressum,
        website_has_privacy: websiteAnalysis.hasPrivacy,
        website_has_contact_form: websiteAnalysis.hasContactForm,
        website_image_count: websiteAnalysis.imageCount,
        website_internal_link_count: websiteAnalysis.internalLinkCount,
        website_external_link_count: websiteAnalysis.externalLinkCount,
        website_design_score: websiteAnalysis.designScore,
        website_visual_issues: websiteAnalysis.visualIssues,
        social_linkedin_url: websiteAnalysis.socialLinks.linkedin,
        social_xing_url: websiteAnalysis.socialLinks.xing,
        social_facebook_url: websiteAnalysis.socialLinks.facebook,
        social_instagram_url: websiteAnalysis.socialLinks.instagram,
        social_youtube_url: websiteAnalysis.socialLinks.youtube,
      }).eq("id", leadId);
    }

    // ── KI-Ampel-Bewertung (Webdesign) ─────────────────────────────────────
    // Direkt nach der Website-Analyse, eigenes Update (robust gegen spätere
    // Fehler). Status bleibt unverändert — reine Kennzeichnung.
    let trafficLight: TrafficLightResult | null = null;
    if (wantTrafficLight && websiteAnalysis) {
      try {
        trafficLight = await evaluateTrafficLight({
          companyName: lead.company_name,
          website: websiteOrDomain,
          description: lead.description ?? null,
          screenshotBuffer: websiteAnalysis.screenshotBuffer,
          signals: {
            designScore: websiteAnalysis.designScore,
            ageEstimate: websiteAnalysis.designEstimate,
            issues: websiteAnalysis.issues,
            visualIssues: websiteAnalysis.visualIssues,
            hasSsl: websiteAnalysis.hasSsl,
            isMobileFriendly: websiteAnalysis.isMobileFriendly,
            technology: websiteAnalysis.technology,
            statusCode: websiteAnalysis.statusCode,
            pageTitle: websiteAnalysis.pageTitle,
            metaDescription: websiteAnalysis.metaDescription,
          },
        });
        await writeTrafficLight(trafficLight);
      } catch {
        // Ampel darf den Flow nie kippen
      }
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

    // 3. Alte Enrichment-Daten löschen (Re-Enrichment) — nur KI-Ergebnisse, keine Import-Daten.
    // NUR Enrichment-Kontakte loeschen. Manuelle (via UI) und BA-Importierte bleiben.
    if (config.contacts_management || config.contacts_hr || config.contacts_all) {
      await db.from("lead_contacts")
        .delete()
        .eq("lead_id", leadId)
        .eq("source", "enrichment");
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
          salutation: c.salutation ?? guessSalutation({ name: c.name, email: c.email }),
          source_url: c.source_url,
          source: "enrichment" as const,
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

    // ── Telefonnummer: füllen ODER offizielle Website-Nummer übernehmen ───────
    // Beim Scrapen/Import landet teils eine falsche Nummer im Lead (z.B. Privat-
    // nummer), während die offizielle Firmennummer im Impressum steht. Regeln:
    //  - Lead-Telefon leer            → jede gefundene Nummer eintragen (wie bisher).
    //  - Lead-Telefon gesetzt, KI-Konfidenz 'high', Nummer unterscheidet sich,
    //    bestehende Nummer NICHT 'manual' → ersetzen; alte Nummer als Kontakt
    //    sichern + Feld-Änderung + System-Notiz (siehe nach dem leads-Update).
    //  - 'manual' / Konfidenz < 'high' / identisch → bestehende Nummer behalten.
    let phoneSwap: { oldPhone: string | null; newPhone: string } | null = null;
    if (isFieldAllowed("phone") && ai.company_phone) {
      const existing = lead.phone as string | null;
      const newPhone = ai.company_phone;
      if (!existing) {
        leadUpdates.phone = newPhone;
        leadUpdates.phone_source = "enrichment";
      } else {
        const conf = ai.company_phone_confidence ?? null;
        const source = (lead as { phone_source?: string | null }).phone_source ?? null;
        const isManual = source === "manual";
        const differs = normalizePhone(existing) !== normalizePhone(newPhone);
        if (conf === "high" && differs && !isManual) {
          leadUpdates.phone = newPhone;
          leadUpdates.phone_source = "enrichment";
          phoneSwap = { oldPhone: existing, newPhone };
        }
        // sonst: bestehende Nummer (manual / low/medium / identisch) behalten.
      }
    }

    if (isFieldAllowed("email")) fillIfEmpty("email", ai.company_email);
    if (isFieldAllowed("address")) {
      // Adresse nur uebernehmen, wenn die KI sich sicher ist. 'medium'/'low' verwerfen
      // wir lieber als falsche Daten zu schreiben (s. Geocoding-Wache in lib/geo/geocode.ts).
      const conf = ai.address_confidence ?? null;
      if (conf === "high") {
        fillIfEmpty("street", ai.street);
        fillIfEmpty("zip", ai.zip);
        fillIfEmpty("city", ai.city);
        fillIfEmpty("state", ai.state);
      } else if (ai.street || ai.zip || ai.city || ai.state) {
        console.warn(
          `[enrich-lead] Adresse fuer Lead ${leadId} ignoriert (confidence=${conf ?? "null"})`,
        );
      }
    }
    if (isFieldAllowed("legal_form")) fillIfEmpty("legal_form", ai.legal_form);
    if (isFieldAllowed("register_id")) fillIfEmpty("register_id", ai.register_id);

    // Karriereseite ins dedizierte Feld — vom Extraktor übernehmen (Altdaten-
    // Migration aus dem alten website-Feld läuft einmalig in Migration 055).
    if (!lead.career_page_url && result.career_page_url) {
      leadUpdates.career_page_url = result.career_page_url;
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
    //
    // Wir tracken hier zusaetzlich die Kriterien, die in die Entscheidung
    // eingeflossen sind — landet im Faktor-Snapshot und ist Grundlage fuers
    // passive Lernen.
    const criteriaMet: Record<string, boolean | null> = {};
    let decisionReasonCode: string | null = null;
    let decisionReasonText: string | null = null;
    let scoringConfigSnapshot: Record<string, unknown> = {};

    if (keepCurrentStatus) {
      decisionReasonCode = "kept_current_status";
      decisionReasonText = `Status ${lead.status} bleibt erhalten (Re-Enrich auf CRM-Lead)`;
    } else if (serviceMode === "webdev") {
      const hasContact = result.contacts.some((c) => !!c.email || !!c.phone);
      const minIssues = webdevScoring?.min_issues_to_qualify ?? 1;
      const issueCount = websiteAnalysis?.issues.length ?? 0;
      criteriaMet.has_contact = hasContact;
      criteriaMet.enough_issues = issueCount >= minIssues;
      scoringConfigSnapshot = { ...webdevScoring };
      if (hasContact && issueCount >= minIssues) {
        leadUpdates.status = "qualified";
        decisionReasonCode = "passed_webdev";
        decisionReasonText = `${issueCount} Website-Probleme >= ${minIssues} und Kontakt mit Email/Phone vorhanden`;
      } else {
        decisionReasonCode = !hasContact ? "no_reachable_contact" : "not_enough_issues";
        decisionReasonText = !hasContact
          ? "Kein Kontakt mit Email oder Telefon"
          : `Nur ${issueCount} Website-Probleme (Schwelle ${minIssues})`;
      }
    } else {
      const scoring = await getRecruitingScoringConfig();
      scoringConfigSnapshot = { ...scoring };

      const hasContactWithEmail = result.contacts.some((c) => !!c.email);
      const hasAnyContact = result.contacts.length > 0;
      const hasHrContact = result.contacts.some((c) => isHrContact(c.role));
      const jobsCount = totalJobs;

      const contactOk = scoring.require_contact_email ? hasContactWithEmail : hasAnyContact;
      const hrOk = !scoring.require_hr_contact || hasHrContact;
      const jobsOk = jobsCount >= scoring.min_job_postings_to_qualify;

      criteriaMet.contact = contactOk;
      criteriaMet.hr_contact = scoring.require_hr_contact ? hasHrContact : null;
      criteriaMet.jobs = jobsOk;

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
        criteriaMet.required_fields = allFieldsFilled;

        if (allFieldsFilled) {
          leadUpdates.status = "qualified";
          decisionReasonCode = "passed_recruiting";
          decisionReasonText = "Alle Recruiting-Kriterien erfuellt";
        } else {
          decisionReasonCode = "required_fields_missing";
          decisionReasonText = `Pflichtfelder fehlen: ${requiredFields.filter((f) => !updatedLead[f]).join(", ")}`;
        }
      } else {
        if (!jobsOk) {
          decisionReasonCode = "no_jobs";
          decisionReasonText = `${jobsCount} Stellen (Schwelle ${scoring.min_job_postings_to_qualify})`;
        } else if (!hrOk) {
          decisionReasonCode = "no_hr_contact";
          decisionReasonText = "Kein HR-Kontakt gefunden";
        } else {
          decisionReasonCode = scoring.require_contact_email ? "no_contact_email" : "no_contact";
          decisionReasonText = scoring.require_contact_email
            ? "Kein Kontakt mit Email-Adresse"
            : "Keine Kontakte gefunden";
        }
      }
    }

    await db.from("leads").update(leadUpdates).eq("id", leadId);

    // Telefon-Swap dokumentieren + alte Nummer bewahren (nur wenn ersetzt wurde).
    if (phoneSwap) {
      // 1) Alte Nummer als Kontakt erhalten — bleibt anrufbar. source 'manual',
      //    damit der Re-Enrich-Cleanup (nur source='enrichment') sie nicht löscht.
      await db.from("lead_contacts").insert({
        lead_id: leadId,
        name: lead.company_name,
        role: "Frühere Telefonnummer (ersetzt durch Website-Nummer)",
        email: null,
        phone: phoneSwap.oldPhone,
        salutation: null,
        source_url: null,
        source: "manual" as const,
      });
      // 2) Feld-Änderung in die Historie — enrich-lead schreibt direkt auf leads
      //    (nicht über updateLead), daher entsteht der lead_changes-Eintrag sonst
      //    nicht. → Feed zeigt "System hat ein Feld aktualisiert · phone: X → Y".
      await db.from("lead_changes").insert({
        lead_id: leadId,
        user_id: null,
        field_name: "phone",
        old_value: phoneSwap.oldPhone,
        new_value: phoneSwap.newPhone,
      });
      // 3) System-Notiz in den Aktivitäten-Feed (best-effort, wirft nie).
      await insertPhoneSwapNote(db, leadId, phoneSwap.oldPhone, phoneSwap.newPhone);
    }

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
    let cancelReasonCode: string | null = null;
    let cancelRuleId: string | null = null;

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
      if (process.env.ENRICH_DEBUG) {
        console.log("[CANCEL_CHECK]", lead.company_name, "leadId:", leadId,
          "totalJobs:", totalJobs, "totalContacts:", totalContacts,
          "llm_jobs:", result.job_postings.length, "llm_contacts:", result.contacts.length);
      }

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

      if (cancelResult.cancelled && cancelResult.reasons.length > 0) {
        cancelled = true;
        cancelReason = cancelResult.reasons.map((r) => r.reason).join("; ");
        cancelReasonCode = cancelResult.reasons[0].reasonCode;
        cancelRuleId = cancelResult.reasons[0].ruleId;

        await db
          .from("leads")
          .update({
            status: "cancelled",
            cancel_reason: cancelReason,
            cancel_reason_code: cancelReasonCode,
            cancel_rule_id: cancelRuleId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", leadId);
      }
    }
    } // Ende: serviceMode === "recruiting" Cancel-Rules Block

    // 9. Faktor-Snapshot + Initial-Quality-Score berechnen.
    // Das ist der zentrale Lernsignal-Container: alle bewertungsrelevanten
    // Faktoren mit Punktwert + Begruendung, plus die getroffene Entscheidung.
    const finalOutcome: FactorSnapshot["decision"]["outcome"] = cancelled
      ? "cancelled"
      : leadUpdates.status === "qualified"
        ? "qualified"
        : "enriched";

    const factorSnapshot = buildFactorSnapshot(
      {
        serviceMode,
        lead: {
          company_name: lead.company_name,
          industry: lead.industry,
          company_size: (leadUpdates.company_size as string | undefined) ?? lead.company_size,
          legal_form: (leadUpdates.legal_form as string | undefined) ?? lead.legal_form,
          register_id: (leadUpdates.register_id as string | undefined) ?? lead.register_id,
          city: (leadUpdates.city as string | undefined) ?? lead.city,
          zip: (leadUpdates.zip as string | undefined) ?? lead.zip,
          street: (leadUpdates.street as string | undefined) ?? lead.street,
          phone: (leadUpdates.phone as string | undefined) ?? lead.phone,
          email: (leadUpdates.email as string | undefined) ?? lead.email,
        },
        website: websiteAnalysis,
        contacts: result.contacts.map((c) => ({
          name: c.name,
          role: c.role,
          email: c.email,
          phone: c.phone,
        })),
        contactsTotal: totalContacts,
        jobs: result.job_postings.map((j) => ({
          title: j.title,
          url: j.url,
          posted_date: j.posted_date,
        })),
        jobsTotal: totalJobs,
        companyDetails: result.additional_info,
        websiteVerified: true,
      },
      {
        outcome: finalOutcome,
        reason_code: cancelled ? cancelReasonCode : decisionReasonCode,
        reason_text: cancelled ? (cancelReason ?? null) : decisionReasonText,
        criteria_met: criteriaMet,
        rule_id: cancelRuleId,
        config_snapshot: scoringConfigSnapshot,
      },
    );

    // Snapshot in lead_enrichments + Score auf Lead persistieren.
    // Lead-Update separat, weil der Cancel-Rules-Pfad oben schon ein Update
    // gemacht hat — wir koennen diesen Score nicht in leadUpdates packen, weil
    // er erst NACH der Cancel-Pruefung berechenbar ist.
    await db
      .from("lead_enrichments")
      .update({
        factor_snapshot: factorSnapshot as unknown as Record<string, unknown>,
      })
      .eq("id", enrichmentId);

    await db
      .from("leads")
      .update({
        initial_quality_score: factorSnapshot.score,
        quality_factors: factorSnapshot.factors as unknown as Record<string, unknown>,
        email_domain_matches_website: factorSnapshot.company.email_domain_match,
        successful_enrichment_count: (lead.successful_enrichment_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId);

    // 10. Audit-Log
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
        cancel_reason_code: cancelReasonCode,
        initial_quality_score: factorSnapshot.score,
        decision_reason_code: decisionReasonCode,
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
      trafficLight: trafficLight?.rating,
      trafficLightReason: trafficLight?.reason,
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
