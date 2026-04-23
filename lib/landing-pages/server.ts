import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { generateSlug } from "./slug";
import type { CaseStudy, Industry, LandingPage, LandingPageWithRelations } from "./types";

// ─── Read-Helpers ────────────────────────────────────────────

export async function listIndustries(onlyActive = true): Promise<Industry[]> {
  const db = createServiceClient();
  let q = db.from("industries").select("*").order("display_order", { ascending: true });
  if (onlyActive) q = q.eq("is_active", true);
  const { data } = await q;
  return (data ?? []) as Industry[];
}

export async function listCaseStudies(onlyActive = true): Promise<CaseStudy[]> {
  const db = createServiceClient();
  let q = db
    .from("case_studies")
    .select("*")
    .is("deleted_at", null)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (onlyActive) q = q.eq("is_active", true);
  const { data } = await q;
  return (data ?? []) as CaseStudy[];
}

export async function listLandingPagesForLead(leadId: string): Promise<LandingPage[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("landing_pages")
    .select("*")
    .eq("lead_id", leadId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  return (data ?? []) as LandingPage[];
}

/** Public Slug-Lookup + Case-Studies + Firmen-/Kontakt-Namen auf einen Rutsch. */
export async function getLandingPageBySlug(slug: string): Promise<LandingPageWithRelations | null> {
  const db = createServiceClient();
  const { data: page } = await db
    .from("landing_pages")
    .select("*")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  if (!page) return null;

  const now = new Date().toISOString();
  if (page.expires_at && page.expires_at < now) return null;

  const [studies, lead, contact] = await Promise.all([
    page.case_study_ids?.length
      ? db
          .from("case_studies")
          .select("*")
          .in("id", page.case_study_ids as string[])
          .is("deleted_at", null)
          .eq("is_active", true)
      : Promise.resolve({ data: [] as CaseStudy[] }),
    page.lead_id
      ? db.from("leads").select("company_name").eq("id", page.lead_id).maybeSingle()
      : Promise.resolve({ data: null }),
    page.contact_id
      ? db.from("lead_contacts").select("name").eq("id", page.contact_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Case-Studies in der ursprünglich gewählten Reihenfolge rendern (Array-Index
  // zählt — DB liefert sie per `in(...)` ungeordnet).
  const byId = new Map<string, CaseStudy>();
  for (const s of (studies.data ?? []) as CaseStudy[]) byId.set(s.id, s);
  const orderedStudies: CaseStudy[] = [];
  for (const id of (page.case_study_ids ?? []) as string[]) {
    const s = byId.get(id);
    if (s) orderedStudies.push(s);
  }

  return {
    ...(page as LandingPage),
    case_studies: orderedStudies,
    company_name: (lead.data as { company_name?: string } | null)?.company_name ?? null,
    contact_name: (contact.data as { name?: string } | null)?.name ?? null,
  };
}

// ─── Write-Helpers ───────────────────────────────────────────

export async function createLandingPage(input: {
  leadId: string | null;
  contactId: string | null;
  industryId: string | null;
  greeting: string;
  headline: string;
  introText: string;
  loomUrl: string | null;
  outroText: string | null;
  caseStudyIds: string[];
  expiresAt: string | null;
  createdBy: string | null;
}): Promise<{ id: string; slug: string } | { error: string }> {
  const db = createServiceClient();

  // Slug-Kollisions-Retry: bis zu 5 Versuche, dann geben wir auf.
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = generateSlug();
    const { data, error } = await db
      .from("landing_pages")
      .insert({
        slug,
        lead_id: input.leadId,
        contact_id: input.contactId,
        industry_id: input.industryId,
        greeting: input.greeting,
        headline: input.headline,
        intro_text: input.introText,
        loom_url: input.loomUrl,
        outro_text: input.outroText,
        case_study_ids: input.caseStudyIds,
        expires_at: input.expiresAt,
        created_by: input.createdBy,
      })
      .select("id, slug")
      .single();
    if (!error && data) return { id: data.id as string, slug: data.slug as string };
    if (error && /duplicate key|unique/i.test(error.message)) continue;
    if (error) return { error: error.message };
  }
  return { error: "Slug-Generator konnte keinen freien Key finden — nochmal versuchen." };
}

/** Fire-and-forget-Tracking: Counter + Timestamp updaten, 1 Zeile in Views. */
export async function trackLandingPageView(input: {
  pageId: string;
  userAgent: string | null;
  ip: string | null;
}): Promise<void> {
  const db = createServiceClient();
  const ipHash = input.ip
    ? createHash("sha256").update(input.ip).digest("hex").slice(0, 32)
    : null;

  // Read-modify-write: Race-Condition möglich bei parallelen Views, aber für
  // einen Orientierungs-Counter absolut unkritisch. Die Views-Tabelle ist die
  // Wahrheit bei Bedarf.
  const { data: cur } = await db
    .from("landing_pages")
    .select("view_count")
    .eq("id", input.pageId)
    .maybeSingle();
  const nextCount = ((cur?.view_count as number | undefined) ?? 0) + 1;

  await Promise.all([
    db.from("landing_page_views").insert({
      landing_page_id: input.pageId,
      user_agent: input.userAgent,
      ip_hash: ipHash,
    }),
    db
      .from("landing_pages")
      .update({ view_count: nextCount, last_viewed_at: new Date().toISOString() })
      .eq("id", input.pageId),
  ]);
}

export async function softDeleteLandingPage(id: string): Promise<{ error?: string }> {
  const db = createServiceClient();
  const { error } = await db
    .from("landing_pages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  return error ? { error: error.message } : {};
}

export async function updateLandingPage(
  id: string,
  patch: Partial<{
    industry_id: string | null;
    contact_id: string | null;
    greeting: string;
    headline: string;
    intro_text: string;
    loom_url: string | null;
    outro_text: string | null;
    case_study_ids: string[];
    expires_at: string | null;
  }>,
): Promise<{ error?: string }> {
  const db = createServiceClient();
  const { error } = await db
    .from("landing_pages")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);
  return error ? { error: error.message } : {};
}
