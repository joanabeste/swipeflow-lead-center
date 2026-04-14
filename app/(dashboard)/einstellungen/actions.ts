"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import type { EnrichmentConfig, ServiceMode } from "@/lib/types";

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
