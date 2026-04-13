import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { SettingsManager } from "./settings-manager";
import { UserManager } from "../nutzer/user-manager";

export default async function EinstellungenPage() {
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
        <h1 className="text-2xl font-bold tracking-tight">Einstellungen</h1>
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          Nur Administratoren haben Zugriff auf die Einstellungen.
        </p>
      </div>
    );
  }

  const [{ data: fieldProfiles }, { data: profiles }] = await Promise.all([
    supabase.from("required_field_profiles").select("*").order("name"),
    supabase.from("profiles").select("*").order("created_at", { ascending: false }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Einstellungen</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        HubSpot, Pflichtfelder und Nutzerverwaltung
      </p>

      <SettingsManager fieldProfiles={fieldProfiles ?? []} />

      <div className="mt-10 border-t border-gray-200 pt-8 dark:border-[#2c2c2e]">
        <h2 className="text-lg font-bold">Nutzer & Rollen</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Benutzer und Rollen verwalten
        </p>
        <UserManager
          profiles={(profiles as Profile[]) ?? []}
          currentUserId={user!.id}
        />
      </div>
    </div>
  );
}
