"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";

export async function addBlacklistEntry(
  _prev: { error?: string } | undefined,
  formData: FormData,
) {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  const matchType = formData.get("match_type") as string;
  const matchValue = formData.get("match_value") as string;
  const reason = formData.get("reason") as string;

  if (!matchType || !matchValue) {
    return { error: "Typ und Wert sind Pflichtfelder." };
  }

  const { error } = await db.from("blacklist_entries").insert({
    match_type: matchType,
    match_value: matchValue.trim(),
    reason: reason?.trim() || null,
    created_by: user?.id ?? null,
  });

  if (error) return { error: error.message };

  await logAudit({
    userId: user?.id ?? null,
    action: "blacklist.entry_added",
    entityType: "blacklist_entry",
    details: { match_type: matchType, match_value: matchValue },
  });

  revalidatePath("/blacklist");
  return { success: true } as { error?: string; success?: boolean };
}

export async function deleteBlacklistEntry(id: string) {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  await db.from("blacklist_entries").delete().eq("id", id);

  await logAudit({
    userId: user?.id ?? null,
    action: "blacklist.entry_deleted",
    entityType: "blacklist_entry",
    entityId: id,
  });

  revalidatePath("/blacklist");
}

export async function addBlacklistRule(
  _prev: { error?: string } | undefined,
  formData: FormData,
) {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  const name = formData.get("name") as string;
  const field = formData.get("field") as string;
  const operator = formData.get("operator") as string;
  const value = formData.get("value") as string;

  if (!name || !field || !operator || !value) {
    return { error: "Alle Felder sind Pflichtfelder." };
  }

  const { error } = await db.from("blacklist_rules").insert({
    name: name.trim(),
    field,
    operator,
    value: value.trim(),
    is_active: true,
    created_by: user?.id ?? null,
  });

  if (error) return { error: error.message };

  await logAudit({
    userId: user?.id ?? null,
    action: "blacklist.rule_added",
    entityType: "blacklist_rule",
    details: { name, field, operator, value },
  });

  revalidatePath("/blacklist");
  return { success: true } as { error?: string; success?: boolean };
}

export async function toggleBlacklistRule(id: string, isActive: boolean) {
  const db = createServiceClient();
  await db.from("blacklist_rules").update({ is_active: isActive }).eq("id", id);
  revalidatePath("/blacklist");
}

export async function deleteBlacklistRule(id: string) {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  await db.from("blacklist_rules").delete().eq("id", id);

  await logAudit({
    userId: user?.id ?? null,
    action: "blacklist.rule_deleted",
    entityType: "blacklist_rule",
    entityId: id,
  });

  revalidatePath("/blacklist");
}
