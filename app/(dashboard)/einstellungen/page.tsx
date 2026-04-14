import { headers } from "next/headers";
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

  // PhoneMondo-Status + Webhook-URL
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const webhookUrl = `${proto}://${host}/api/phonemondo/webhook`;
  const phonemondoStatus = {
    hasToken: !!process.env.PHONEMONDO_API_TOKEN,
    hasSecret: !!process.env.PHONEMONDO_WEBHOOK_SECRET,
    baseUrl: process.env.PHONEMONDO_API_BASE_URL ?? "https://phonemondo.com/api/v1",
  };

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
        phonemondoStatus={phonemondoStatus}
        phonemondoWebhookUrl={webhookUrl}
        currentUserId={user!.id}
      />
    </div>
  );
}
