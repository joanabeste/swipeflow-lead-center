"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import type { Lead } from "@/lib/types";

export async function updateLead(
  leadId: string,
  updates: Partial<Lead>,
) {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Alten Stand laden für Change-Tracking
  const { data: oldLead } = await db
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .single();

  if (!oldLead) return { error: "Lead nicht gefunden." };

  // Update durchführen
  const { error } = await db
    .from("leads")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", leadId);

  if (error) return { error: error.message };

  // Änderungen protokollieren
  const changes: { lead_id: string; user_id: string | null; field_name: string; old_value: string | null; new_value: string | null }[] = [];
  for (const [key, newValue] of Object.entries(updates)) {
    const oldValue = oldLead[key as keyof typeof oldLead];
    if (String(oldValue ?? "") !== String(newValue ?? "")) {
      changes.push({
        lead_id: leadId,
        user_id: user?.id ?? null,
        field_name: key,
        old_value: oldValue != null ? String(oldValue) : null,
        new_value: newValue != null ? String(newValue) : null,
      });
    }
  }

  if (changes.length > 0) {
    await db.from("lead_changes").insert(changes);
  }

  await logAudit({
    userId: user?.id ?? null,
    action: "lead.updated",
    entityType: "lead",
    entityId: leadId,
    details: { fields: Object.keys(updates) },
  });

  revalidatePath("/leads");
  return { success: true };
}

export async function deleteLead(leadId: string) {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await db.from("leads").delete().eq("id", leadId);

  if (error) return { error: error.message };

  await logAudit({
    userId: user?.id ?? null,
    action: "lead.deleted",
    entityType: "lead",
    entityId: leadId,
  });

  revalidatePath("/leads");
  return { success: true };
}

export async function saveColumnPreferences(columns: string[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const db = createServiceClient();
  await db
    .from("profiles")
    .update({ lead_table_columns: columns })
    .eq("id", user.id);
}

export async function bulkUpdateStatus(leadIds: string[], status: string) {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await db
    .from("leads")
    .update({ status, updated_at: new Date().toISOString() })
    .in("id", leadIds);

  if (error) return { error: error.message };

  await logAudit({
    userId: user?.id ?? null,
    action: "lead.bulk_status_update",
    entityType: "lead",
    details: { lead_count: leadIds.length, new_status: status },
  });

  revalidatePath("/leads");
  return { success: true };
}
