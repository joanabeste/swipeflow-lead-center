import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { UserManager } from "./user-manager";

export default async function NutzerPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();

  if (currentProfile?.role !== "admin") {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nutzer</h1>
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          Nur Administratoren haben Zugriff auf die Nutzerverwaltung.
        </p>
      </div>
    );
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Nutzer</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Benutzer und Rollen verwalten
      </p>

      <UserManager
        profiles={(profiles as Profile[]) ?? []}
        currentUserId={user!.id}
      />
    </div>
  );
}
