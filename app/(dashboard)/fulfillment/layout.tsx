import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

const ALLOWED: UserRole[] = ["admin", "sales", "viewer"];

export default async function FulfillmentLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single<{ role: UserRole }>();
  if (!profile || !ALLOWED.includes(profile.role)) redirect("/zeit");
  return <>{children}</>;
}
