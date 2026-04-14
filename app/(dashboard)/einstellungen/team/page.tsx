import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { PageHeader } from "../_components/ui";
import { UserManager } from "../../nutzer/user-manager";

export default async function TeamPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div>
      <PageHeader
        icon={Users}
        category="Team"
        title="Nutzer & Rollen"
        subtitle="Benutzerkonten und deren Berechtigungen verwalten."
      />
      <UserManager profiles={(profiles as Profile[]) ?? []} currentUserId={user!.id} />
    </div>
  );
}
