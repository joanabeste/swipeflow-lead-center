"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { requireZeitAdmin } from "@/lib/zeit/auth";
import { describeZeitError } from "@/lib/zeit/translate-error";
import { logAudit } from "@/lib/audit-log";
import type { UserRole, BreakMode } from "@/lib/types";

type ActionResult = { success: true } | { error: string };

export interface UpdateZeitProfileInput {
  name?: string;
  role?: UserRole;
  hours_mon?: number;
  hours_tue?: number;
  hours_wed?: number;
  hours_thu?: number;
  hours_fri?: number;
  hours_sat?: number;
  hours_sun?: number;
  vacation_days_per_year?: number;
  break_mode?: BreakMode;
}

const ROLES: UserRole[] = ["admin", "sales", "viewer", "employee"];

export async function updateZeitProfile(userId: string, patch: UpdateZeitProfileInput): Promise<ActionResult> {
  const ctx = await requireZeitAdmin();
  const update: Record<string, unknown> = {};

  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (trimmed.length < 1 || trimmed.length > 120) return { error: "Name muss 1–120 Zeichen lang sein." };
    update.name = trimmed;
  }
  if (patch.role !== undefined) {
    if (!ROLES.includes(patch.role)) return { error: "Ungueltige Rolle." };
    update.role = patch.role;
  }
  for (const key of ["hours_mon", "hours_tue", "hours_wed", "hours_thu", "hours_fri", "hours_sat", "hours_sun"] as const) {
    const v = patch[key];
    if (v !== undefined) {
      if (typeof v !== "number" || v < 0 || v > 24) return { error: `${key}: Wert zwischen 0 und 24.` };
      update[key] = v;
    }
  }
  if (patch.vacation_days_per_year !== undefined) {
    if (patch.vacation_days_per_year < 0 || patch.vacation_days_per_year > 365)
      return { error: "Urlaubstage muessen zwischen 0 und 365 liegen." };
    update.vacation_days_per_year = patch.vacation_days_per_year;
  }
  if (patch.break_mode !== undefined) {
    if (patch.break_mode !== "manual" && patch.break_mode !== "auto_deduct")
      return { error: "Ungueltiger Pausen-Modus." };
    update.break_mode = patch.break_mode;
  }
  if (Object.keys(update).length === 0) return { error: "Keine Aenderungen." };

  const db = createServiceClient();
  const { error } = await db.from("profiles").update(update).eq("id", userId);
  if (error) return { error: describeZeitError(error) };

  await logAudit({
    userId: ctx.user.id,
    action: "zeit.profile.update",
    entityType: "profile",
    entityId: userId,
    details: update,
  });
  revalidatePath("/zeit/admin/mitarbeiter");
  revalidatePath(`/zeit/admin/mitarbeiter/${userId}`);
  return { success: true };
}
