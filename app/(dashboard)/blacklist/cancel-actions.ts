"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";

export async function addCancelRule(
  _prev: { error?: string } | undefined,
  formData: FormData,
) {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const category = formData.get("category") as string;
  const field = formData.get("field") as string;
  const operator = formData.get("operator") as string;
  const value = formData.get("value") as string;

  if (!name || !category || !field || !operator) {
    return { error: "Bitte alle Pflichtfelder ausfüllen." };
  }

  const { error } = await db.from("cancel_rules").insert({
    name,
    description: description || null,
    category,
    field,
    operator,
    value: value ?? "",
    created_by: user?.id,
  });

  if (error) return { error: error.message };

  await logAudit({
    userId: user?.id ?? null,
    action: "cancel_rule.created",
    entityType: "cancel_rule",
    details: { name, category, field, operator, value },
  });

  revalidatePath("/blacklist");
  return {};
}

export async function toggleCancelRule(ruleId: string, isActive: boolean) {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  await db.from("cancel_rules").update({ is_active: isActive }).eq("id", ruleId);

  await logAudit({
    userId: user?.id ?? null,
    action: isActive ? "cancel_rule.activated" : "cancel_rule.deactivated",
    entityType: "cancel_rule",
    entityId: ruleId,
  });

  revalidatePath("/blacklist");
}

export async function deleteCancelRule(ruleId: string) {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  await db.from("cancel_rules").delete().eq("id", ruleId);

  await logAudit({
    userId: user?.id ?? null,
    action: "cancel_rule.deleted",
    entityType: "cancel_rule",
    entityId: ruleId,
  });

  revalidatePath("/blacklist");
}
