import { createClient } from "@/lib/supabase/server";
import type { CustomLeadStatus, Profile } from "@/lib/types";
import { SettingsManager } from "./settings-manager";
import { getAllEnrichmentDefaults } from "@/lib/enrichment/defaults";
import { getWebdevScoringConfig } from "@/lib/enrichment/webdev-scoring";
import { getRecruitingScoringConfig } from "@/lib/enrichment/recruiting-scoring";
import { getHqLocation } from "@/lib/app-settings";

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

  const [{ data: fieldProfiles }, { data: profiles }, { data: crmStatuses }, enrichmentDefaults, webdevScoring, recruitingScoring, hq] = await Promise.all([
    supabase.from("required_field_profiles").select("*").order("name"),
    supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    supabase.from("custom_lead_statuses").select("*").order("display_order", { ascending: true }),
    getAllEnrichmentDefaults(),
    getWebdevScoringConfig(),
    getRecruitingScoringConfig(),
    getHqLocation(),
  ]);

  return (
    <div>
      <div className="border-b border-gray-200 pb-4 dark:border-[#2c2c2e]">
        <h1 className="text-2xl font-bold tracking-tight">Einstellungen</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Standort, Anreicherung, Bewertung, Pflichtfelder und Nutzerverwaltung
        </p>
      </div>

      <SettingsManager
        fieldProfiles={fieldProfiles ?? []}
        enrichmentDefaults={enrichmentDefaults}
        webdevScoring={webdevScoring}
        recruitingScoring={recruitingScoring}
        hq={hq}
        profiles={(profiles as Profile[]) ?? []}
        crmStatuses={(crmStatuses as CustomLeadStatus[]) ?? []}
        currentUserId={user!.id}
      />
    </div>
  );
}
