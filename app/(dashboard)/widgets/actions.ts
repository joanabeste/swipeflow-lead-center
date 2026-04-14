"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function saveDashboardWidgets(widgets: string[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const db = createServiceClient();
  const { error } = await db
    .from("profiles")
    .update({ dashboard_widgets: widgets, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/");
  return { success: true };
}
