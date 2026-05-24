"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { requireZeitAdmin } from "@/lib/zeit/auth";
import { describeZeitError } from "@/lib/zeit/translate-error";
import { logAudit } from "@/lib/audit-log";

type ActionResult = { success: true } | { error: string };

export async function decideAbsence(id: string, status: "approved" | "rejected"): Promise<ActionResult> {
  if (status !== "approved" && status !== "rejected") return { error: "Ungueltiger Status." };
  const ctx = await requireZeitAdmin();
  const db = createServiceClient();
  const { error } = await db
    .from("absences")
    .update({ status, decided_by: ctx.user.id, decided_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: describeZeitError(error) };
  await logAudit({
    userId: ctx.user.id,
    action: `zeit.absence.${status}`,
    entityType: "absence",
    entityId: id,
  });
  revalidatePath("/zeit/admin/abwesenheiten");
  revalidatePath("/zeit/abwesenheiten");
  revalidatePath("/zeit/kalender");
  return { success: true };
}
