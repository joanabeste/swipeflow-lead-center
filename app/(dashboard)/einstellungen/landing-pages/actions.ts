"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ─── Industries ─────────────────────────────────────────────

export async function saveIndustryAction(input: {
  id: string;
  label: string;
  displayOrder: number;
  isActive: boolean;
  greetingTemplate?: string;
  headlineTemplate?: string;
  introTemplate?: string;
  outroTemplate?: string | null;
  loomUrl?: string | null;
}): Promise<{ success: true } | { error: string }> {
  const user = await requireUser();
  if (!user) return { error: "Nicht angemeldet." };
  const id = input.id.trim().toLowerCase();
  const label = input.label.trim();
  if (!id || !/^[a-z0-9-]+$/.test(id)) return { error: "ID muss aus Kleinbuchstaben, Zahlen oder Bindestrich bestehen." };
  if (!label) return { error: "Label fehlt." };

  const db = createServiceClient();
  // Templates nur setzen, wenn mitgegeben — sonst beim reinen Umbenennen/
  // Reihenfolge-Ändern nicht ungewollt überschreiben.
  const payload: Record<string, unknown> = {
    id,
    label,
    display_order: input.displayOrder,
    is_active: input.isActive,
  };
  if (input.greetingTemplate !== undefined) payload.greeting_template = input.greetingTemplate;
  if (input.headlineTemplate !== undefined) payload.headline_template = input.headlineTemplate;
  if (input.introTemplate !== undefined) payload.intro_template = input.introTemplate;
  if (input.outroTemplate !== undefined) payload.outro_template = input.outroTemplate;
  if (input.loomUrl !== undefined) payload.loom_url = input.loomUrl;

  const { error } = await db.from("industries").upsert(payload);
  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    action: "industry.saved",
    entityType: "industry",
    entityId: id,
    details: { label },
  });
  revalidatePath("/einstellungen/landing-pages");
  return { success: true };
}

export async function deleteIndustryAction(id: string): Promise<{ success: true } | { error: string }> {
  const user = await requireUser();
  if (!user) return { error: "Nicht angemeldet." };
  const db = createServiceClient();
  // Referenzen prüfen: Case-Studies nullen, Landing-Pages nullen.
  const { count } = await db
    .from("case_studies")
    .select("id", { count: "exact", head: true })
    .eq("industry_id", id);
  if ((count ?? 0) > 0) {
    return { error: `Branche ist noch an ${count} Case-Study/Studies gebunden. Erst umordnen oder deaktivieren.` };
  }
  const { error } = await db.from("industries").delete().eq("id", id);
  if (error) return { error: error.message };
  await logAudit({ userId: user.id, action: "industry.deleted", entityType: "industry", entityId: id });
  revalidatePath("/einstellungen/landing-pages");
  return { success: true };
}

// ─── Case Studies ───────────────────────────────────────────

export async function saveCaseStudyAction(input: {
  id?: string;
  industryId: string | null;
  title: string;
  subtitle: string | null;
  description: string | null;
  linkUrl: string | null;
  imageUrl: string | null;
  isActive: boolean;
  displayOrder: number;
}): Promise<{ success: true; id: string } | { error: string }> {
  const user = await requireUser();
  if (!user) return { error: "Nicht angemeldet." };
  const title = input.title.trim();
  if (!title) return { error: "Titel fehlt." };

  const db = createServiceClient();
  const payload = {
    industry_id: input.industryId,
    title,
    subtitle: input.subtitle?.trim() || null,
    description: input.description?.trim() || null,
    link_url: input.linkUrl?.trim() || null,
    image_url: input.imageUrl?.trim() || null,
    is_active: input.isActive,
    display_order: input.displayOrder,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { error } = await db.from("case_studies").update(payload).eq("id", input.id);
    if (error) return { error: error.message };
    await logAudit({
      userId: user.id,
      action: "case_study.updated",
      entityType: "case_study",
      entityId: input.id,
      details: { title },
    });
    revalidatePath("/einstellungen/landing-pages");
    return { success: true, id: input.id };
  }

  const { data, error } = await db
    .from("case_studies")
    .insert({ ...payload, created_by: user.id })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Konnte Case-Study nicht anlegen." };
  await logAudit({
    userId: user.id,
    action: "case_study.created",
    entityType: "case_study",
    entityId: data.id as string,
    details: { title },
  });
  revalidatePath("/einstellungen/landing-pages");
  return { success: true, id: data.id as string };
}

export async function deleteCaseStudyAction(id: string): Promise<{ success: true } | { error: string }> {
  const user = await requireUser();
  if (!user) return { error: "Nicht angemeldet." };
  const db = createServiceClient();
  // Soft-Delete: bereits versendete Landing-Pages referenzieren diese IDs
  // über `case_study_ids[]` und sollen nicht plötzlich mit Lücken rendern.
  const { error } = await db
    .from("case_studies")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  await logAudit({ userId: user.id, action: "case_study.deleted", entityType: "case_study", entityId: id });
  revalidatePath("/einstellungen/landing-pages");
  return { success: true };
}
