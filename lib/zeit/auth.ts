import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export interface ZeitContext {
  user: { id: string; email?: string | null };
  profile: Profile;
}

export async function getZeitContext(): Promise<ZeitContext | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();
  if (!profile) return null;
  return { user: { id: user.id, email: user.email }, profile };
}

export async function requireZeitUser(): Promise<ZeitContext> {
  const ctx = await getZeitContext();
  if (!ctx) redirect("/login");
  return ctx;
}

export async function requireZeitAdmin(): Promise<ZeitContext> {
  const ctx = await requireZeitUser();
  if (ctx.profile.role !== "admin") {
    redirect("/zeit?error=forbidden");
  }
  return ctx;
}
