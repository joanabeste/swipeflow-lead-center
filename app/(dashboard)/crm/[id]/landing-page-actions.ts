"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import {
  createLandingPage,
  softDeleteLandingPage,
  updateLandingPage,
} from "@/lib/landing-pages/server";
import { extractBrandFromWebsite } from "@/lib/landing-pages/brand";

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function cleanSnapshot(input: {
  greeting: string;
  headline: string;
  introText: string;
  loomUrl: string | null;
  outroText: string | null;
  calendlyUrl: string | null;
  primaryColor: string | null;
  logoUrl: string | null;
}):
  | {
      greeting: string;
      headline: string;
      introText: string;
      loomUrl: string | null;
      outroText: string | null;
      calendlyUrl: string | null;
      primaryColor: string | null;
      logoUrl: string | null;
    }
  | { error: string } {
  const greeting = input.greeting.trim();
  const headline = input.headline.trim();
  const introText = input.introText.trim();
  if (!greeting) return { error: "Begrüßung fehlt." };
  if (!headline) return { error: "Headline fehlt." };
  if (!introText) return { error: "Intro-Text fehlt." };
  const loomUrl = input.loomUrl?.trim() || null;
  const outroText = input.outroText?.trim() || null;
  const calendlyUrl = input.calendlyUrl?.trim() || null;
  // Farb-Normalisierung auf Hex ohne harte Validierung — wenn der User Murks
  // eingibt, fällt die Seite einfach auf den Default-Farbton zurück.
  const primaryColor = input.primaryColor?.trim().toLowerCase() || null;
  const logoUrl = input.logoUrl?.trim() || null;
  return { greeting, headline, introText, loomUrl, outroText, calendlyUrl, primaryColor, logoUrl };
}

export async function createLandingPageAction(input: {
  leadId: string;
  contactId: string | null;
  industryId: string | null;
  companyName: string | null;
  greeting: string;
  headline: string;
  introText: string;
  loomUrl: string | null;
  outroText: string | null;
  caseStudyIds: string[];
  calendlyUrl: string | null;
  primaryColor: string | null;
  logoUrl: string | null;
}): Promise<{ success: true; id: string; slug: string } | { error: string }> {
  const user = await requireUser();
  if (!user) return { error: "Nicht angemeldet." };

  const cleaned = cleanSnapshot(input);
  if ("error" in cleaned) return cleaned;

  const res = await createLandingPage({
    leadId: input.leadId,
    contactId: input.contactId,
    industryId: input.industryId,
    companyName: input.companyName,
    greeting: cleaned.greeting,
    headline: cleaned.headline,
    introText: cleaned.introText,
    loomUrl: cleaned.loomUrl,
    outroText: cleaned.outroText,
    caseStudyIds: input.caseStudyIds,
    calendlyUrl: cleaned.calendlyUrl,
    primaryColor: cleaned.primaryColor,
    logoUrl: cleaned.logoUrl,
    expiresAt: null,
    createdBy: user.id,
  });
  if ("error" in res) return { error: res.error };

  await logAudit({
    userId: user.id,
    action: "landing_page.created",
    entityType: "landing_page",
    entityId: res.id,
    details: { lead_id: input.leadId, slug: res.slug, industry_id: input.industryId },
  });
  revalidatePath(`/crm/${input.leadId}`);
  return { success: true, id: res.id, slug: res.slug };
}

export async function updateLandingPageAction(input: {
  id: string;
  leadId: string;
  contactId: string | null;
  industryId: string | null;
  greeting: string;
  headline: string;
  introText: string;
  loomUrl: string | null;
  outroText: string | null;
  caseStudyIds: string[];
  calendlyUrl: string | null;
  primaryColor: string | null;
  logoUrl: string | null;
}): Promise<{ success: true } | { error: string }> {
  const user = await requireUser();
  if (!user) return { error: "Nicht angemeldet." };

  const cleaned = cleanSnapshot(input);
  if ("error" in cleaned) return cleaned;

  const res = await updateLandingPage(input.id, {
    contact_id: input.contactId,
    industry_id: input.industryId,
    greeting: cleaned.greeting,
    headline: cleaned.headline,
    intro_text: cleaned.introText,
    loom_url: cleaned.loomUrl,
    outro_text: cleaned.outroText,
    case_study_ids: input.caseStudyIds,
    calendly_url: cleaned.calendlyUrl,
    primary_color: cleaned.primaryColor,
    logo_url: cleaned.logoUrl,
  });
  if (res.error) return { error: res.error };

  await logAudit({
    userId: user.id,
    action: "landing_page.updated",
    entityType: "landing_page",
    entityId: input.id,
    details: { lead_id: input.leadId },
  });
  revalidatePath(`/crm/${input.leadId}`);
  return { success: true };
}

/**
 * Holt die CI-Daten (Primärfarbe, Logo) aus der Website des Leads und cached
 * sie am Lead. Beim nächsten Landing-Page-Erstellen werden die gecachten
 * Werte sofort ohne HTTP-Roundtrip wiederverwendet.
 *
 * Wenn `forceRefresh` false und bereits Werte gecached sind, werden die
 * Cache-Werte ohne HTTP-Call zurückgegeben.
 */
export async function extractLeadBrandAction(input: {
  leadId: string;
  forceRefresh?: boolean;
}): Promise<
  | { success: true; primaryColor: string | null; logoUrl: string | null; cached: boolean }
  | { error: string }
> {
  const user = await requireUser();
  if (!user) return { error: "Nicht angemeldet." };

  const db = createServiceClient();
  const { data: lead } = await db
    .from("leads")
    .select("website, domain, primary_color, logo_url")
    .eq("id", input.leadId)
    .maybeSingle();
  if (!lead) return { error: "Lead nicht gefunden." };

  const cacheHit = !!(lead.primary_color || lead.logo_url);
  if (!input.forceRefresh && cacheHit) {
    return {
      success: true,
      primaryColor: (lead.primary_color as string | null) ?? null,
      logoUrl: (lead.logo_url as string | null) ?? null,
      cached: true,
    };
  }

  const source = (lead.website as string | null) || (lead.domain as string | null);
  if (!source) {
    return { error: "Lead hat weder Website noch Domain — nichts zu extrahieren." };
  }

  const { primaryColor, logoUrl } = await extractBrandFromWebsite(source);

  await db
    .from("leads")
    .update({ primary_color: primaryColor, logo_url: logoUrl })
    .eq("id", input.leadId);

  return { success: true, primaryColor, logoUrl, cached: false };
}

export async function deleteLandingPageAction(input: {
  id: string;
  leadId: string;
}): Promise<{ success: true } | { error: string }> {
  const user = await requireUser();
  if (!user) return { error: "Nicht angemeldet." };

  const res = await softDeleteLandingPage(input.id);
  if (res.error) return { error: res.error };

  await logAudit({
    userId: user.id,
    action: "landing_page.deleted",
    entityType: "landing_page",
    entityId: input.id,
    details: { lead_id: input.leadId },
  });
  revalidatePath(`/crm/${input.leadId}`);
  return { success: true };
}
