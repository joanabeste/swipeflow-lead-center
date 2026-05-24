"use server";

import { revalidatePath } from "next/cache";
import { checkAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function markLessonComplete(lessonId: string): Promise<{ error?: string }> {
  const ctx = await checkAuth();
  if (!ctx) return { error: "Nicht angemeldet." };

  // User-Client (nicht Service) damit RLS greift und nichts an fremde user_ids geschrieben werden kann.
  const supabase = await createClient();
  const { error } = await supabase
    .from("learning_lesson_progress")
    .upsert(
      { user_id: ctx.user.id, lesson_id: lessonId, completed_at: new Date().toISOString() },
      { onConflict: "user_id,lesson_id" },
    );
  if (error) return { error: error.message };
  revalidatePath("/learning", "layout");
  return {};
}

export async function markLessonIncomplete(lessonId: string): Promise<{ error?: string }> {
  const ctx = await checkAuth();
  if (!ctx) return { error: "Nicht angemeldet." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("learning_lesson_progress")
    .delete()
    .eq("user_id", ctx.user.id)
    .eq("lesson_id", lessonId);
  if (error) return { error: error.message };
  revalidatePath("/learning", "layout");
  return {};
}
