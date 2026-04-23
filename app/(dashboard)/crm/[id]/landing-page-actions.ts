"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import {
  createLandingPage,
  softDeleteLandingPage,
  updateLandingPage,
} from "@/lib/landing-pages/server";

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
}): { greeting: string; headline: string; introText: string; loomUrl: string | null; outroText: string | null } | { error: string } {
  const greeting = input.greeting.trim();
  const headline = input.headline.trim();
  const introText = input.introText.trim();
  if (!greeting) return { error: "Begrüßung fehlt." };
  if (!headline) return { error: "Headline fehlt." };
  if (!introText) return { error: "Intro-Text fehlt." };
  const loomUrl = input.loomUrl?.trim() || null;
  const outroText = input.outroText?.trim() || null;
  return { greeting, headline, introText, loomUrl, outroText };
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
