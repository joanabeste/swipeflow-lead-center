"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { checkAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit-log";
import { FEATURE_KEYS } from "@/lib/fulfillment/project-features";

async function ensureAdmin() {
  const ctx = await checkAdmin();
  if (!ctx) return { error: "Nur Administratoren." as const };
  return { user: ctx.user };
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "typ"
  );
}

export async function saveProjectType(_prev: unknown, formData: FormData) {
  const check = await ensureAdmin();
  if ("error" in check) return { error: check.error };
  const db = createServiceClient();

  const id = (formData.get("id") as string | null)?.trim();
  const label = ((formData.get("label") as string) || "").trim();
  const color = ((formData.get("color") as string) || "#6b7280").trim();
  const icon = ((formData.get("icon") as string) || "").trim() || null;
  const displayOrder = parseInt((formData.get("display_order") as string) || "0", 10) || 0;
  const isActive = formData.get("is_active") === "on";
  // Nur bekannte Feature-Keys übernehmen.
  const features = formData
    .getAll("features")
    .map(String)
    .filter((f) => (FEATURE_KEYS as readonly string[]).includes(f));

  if (!label) return { error: "Label fehlt." };

  if (id) {
    const { error } = await db
      .from("project_types")
      .update({
        label,
        color,
        icon,
        features,
        display_order: displayOrder,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) return { error: error.message };
    await logAudit({
      userId: check.user.id,
      action: "project_type.updated",
      entityType: "project_type",
      entityId: id,
      details: { label, features },
    });
  } else {
    let slug = slugify(label);
    for (let i = 2; i < 50; i++) {
      const { data: exists } = await db.from("project_types").select("id").eq("slug", slug).maybeSingle();
      if (!exists) break;
      slug = `${slugify(label)}-${i}`;
    }
    const { data, error } = await db
      .from("project_types")
      .insert({
        slug,
        label,
        color,
        icon,
        features,
        display_order: displayOrder,
        is_active: isActive,
        created_by: check.user.id,
      })
      .select("id")
      .single();
    if (error) return { error: error.message };
    await logAudit({
      userId: check.user.id,
      action: "project_type.created",
      entityType: "project_type",
      entityId: data.id,
      details: { label, features },
    });
  }

  revalidatePath("/einstellungen/projekt-typen");
  revalidatePath("/fulfillment");
  return { success: true };
}

export async function deleteProjectType(id: string) {
  const check = await ensureAdmin();
  if ("error" in check) return { error: check.error };
  const db = createServiceClient();
  // Projekte mit diesem Typ behalten ihre Daten (FK ON DELETE SET NULL).
  const { error } = await db.from("project_types").delete().eq("id", id);
  if (error) return { error: error.message };
  await logAudit({
    userId: check.user.id,
    action: "project_type.deleted",
    entityType: "project_type",
    entityId: id,
  });
  revalidatePath("/einstellungen/projekt-typen");
  revalidatePath("/fulfillment");
  return { success: true };
}
