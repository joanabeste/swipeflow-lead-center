import { createClient } from "@/lib/supabase/server";
import { SettingsManager } from "./settings-manager";

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

  const { data: fieldProfiles } = await supabase
    .from("required_field_profiles")
    .select("*")
    .order("name");

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Einstellungen</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        HubSpot-Konfiguration und Pflichtfeld-Profile
      </p>

      <SettingsManager fieldProfiles={fieldProfiles ?? []} />
    </div>
  );
}
