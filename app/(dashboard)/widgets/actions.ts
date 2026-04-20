"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { WidgetLayoutItem, WidgetWidth } from "./registry";

const VALID_WIDTHS: WidgetWidth[] = ["third", "half", "two-thirds", "full"];

function sanitizeLayout(input: unknown): WidgetLayoutItem[] {
  if (!Array.isArray(input)) return [];
  const out: WidgetLayoutItem[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;
    const k = (entry as { k?: unknown }).k;
    const w = (entry as { w?: unknown }).w;
    if (typeof k !== "string") continue;
    const width = VALID_WIDTHS.includes(w as WidgetWidth) ? (w as WidgetWidth) : "full";
    out.push({ k, w: width });
  }
  return out;
}

export async function saveDashboardLayout(layout: WidgetLayoutItem[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const clean = sanitizeLayout(layout);

  const db = createServiceClient();
  const { error } = await db
    .from("profiles")
    .update({ dashboard_widgets: clean, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/");
  return { success: true };
}
