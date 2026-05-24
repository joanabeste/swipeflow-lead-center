"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { requireZeitUser } from "@/lib/zeit/auth";
import { describeZeitError } from "@/lib/zeit/translate-error";
import { logAudit } from "@/lib/audit-log";
import type { BreakMode } from "@/lib/types";

type ActionResult = { success: true } | { error: string };

export async function updateOwnBreakMode(mode: BreakMode): Promise<ActionResult> {
  if (mode !== "manual" && mode !== "auto_deduct") return { error: "Ungueltiger Pausen-Modus." };
  const ctx = await requireZeitUser();
  const db = createServiceClient();
  const { error } = await db.from("profiles").update({ break_mode: mode }).eq("id", ctx.user.id);
  if (error) return { error: describeZeitError(error) };
  await logAudit({ userId: ctx.user.id, action: "zeit.profile.break_mode", details: { mode } });
  revalidatePath("/zeit/einstellungen");
  revalidatePath("/zeit");
  return { success: true };
}
