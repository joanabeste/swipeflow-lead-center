"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import type { EnrichmentConfig, ServiceMode, WebdevStrictness } from "@/lib/types";

export async function saveFieldProfile(
  _prev: { error?: string } | undefined,
  formData: FormData,
) {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  const name = formData.get("name") as string;
  const fields = formData.getAll("fields") as string[];
  const isDefault = formData.get("is_default") === "on";

  if (!name || fields.length === 0) {
    return { error: "Name und mindestens ein Pflichtfeld sind erforderlich." };
  }

  if (isDefault) {
    await db
      .from("required_field_profiles")
      .update({ is_default: false })
      .eq("is_default", true);
  }

  const { error } = await db.from("required_field_profiles").insert({
    name,
    required_fields: fields,
    is_default: isDefault,
    created_by: user?.id ?? null,
  });

  if (error) return { error: error.message };

  await logAudit({
    userId: user?.id ?? null,
    action: "settings.field_profile_created",
    entityType: "required_field_profile",
    details: { name, fields },
  });

  revalidatePath("/einstellungen");
  return { success: true } as { error?: string; success?: boolean };
}

type EnrichmentDefaultsState = { error?: string; success?: boolean; mode?: ServiceMode };

export async function saveEnrichmentDefaults(
  _prev: EnrichmentDefaultsState | undefined,
  formData: FormData,
): Promise<EnrichmentDefaultsState> {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Admin-Check
  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();

  if (profile?.role !== "admin") {
    return { error: "Nur Administratoren dürfen Defaults ändern." };
  }

  const mode = formData.get("mode") as ServiceMode;
  if (mode !== "recruiting" && mode !== "webdev") {
    return { error: "Ungültiger Modus." };
  }

  const config: EnrichmentConfig = {
    contacts_management: formData.get("contacts_management") === "on",
    contacts_all: formData.get("contacts_all") === "on",
    job_postings: formData.get("job_postings") === "on",
    career_page: formData.get("career_page") === "on",
    company_details: formData.get("company_details") === "on",
  };

  const { error } = await db
    .from("enrichment_defaults")
    .upsert(
      {
        service_mode: mode,
        config: config as unknown as Record<string, unknown>,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "service_mode" },
    );

  if (error) return { error: error.message };

  await logAudit({
    userId: user?.id ?? null,
    action: "settings.enrichment_defaults_updated",
    entityType: "enrichment_defaults",
    details: { mode, config },
  });

  revalidatePath("/einstellungen");
  revalidatePath("/leads");
  return { success: true, mode };
}

export async function saveWebdevScoring(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();
  if (profile?.role !== "admin") {
    return { error: "Nur Administratoren dürfen die Webdesign-Bewertung ändern." };
  }

  const strictness = formData.get("strictness") as WebdevStrictness;
  if (!["lax", "normal", "strict"].includes(strictness)) {
    return { error: "Ungültige Strenge." };
  }

  const designFocus = (formData.get("design_focus") as string | null)?.trim() || null;
  const minIssues = Math.max(1, parseInt((formData.get("min_issues_to_qualify") as string) ?? "2", 10) || 2);
  const slowMs = Math.max(500, parseInt((formData.get("slow_load_threshold_s") as string) ?? "3", 10) * 1000);
  const verySlowMs = Math.max(slowMs + 500, parseInt((formData.get("very_slow_load_threshold_s") as string) ?? "5", 10) * 1000);

  const { error } = await db.from("webdev_scoring_config").upsert(
    {
      id: 1,
      strictness,
      design_focus: designFocus,
      min_issues_to_qualify: minIssues,
      slow_load_threshold_ms: slowMs,
      very_slow_load_threshold_ms: verySlowMs,
      check_ssl: formData.get("check_ssl") === "on",
      check_responsive: formData.get("check_responsive") === "on",
      check_meta_tags: formData.get("check_meta_tags") === "on",
      check_alt_tags: formData.get("check_alt_tags") === "on",
      check_outdated_html: formData.get("check_outdated_html") === "on",
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) return { error: error.message };

  await logAudit({
    userId: user?.id ?? null,
    action: "settings.webdev_scoring_updated",
    entityType: "webdev_scoring_config",
    details: { strictness, minIssues, slowMs, verySlowMs, designFocus },
  });

  revalidatePath("/einstellungen");
  return { success: true };
}

export async function deleteFieldProfile(id: string) {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  await db.from("required_field_profiles").delete().eq("id", id);

  await logAudit({
    userId: user?.id ?? null,
    action: "settings.field_profile_deleted",
    entityType: "required_field_profile",
    entityId: id,
  });

  revalidatePath("/einstellungen");
}
