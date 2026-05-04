import { createClient } from "@/lib/supabase/server";
import type { EnrichmentConfig, ServiceMode } from "@/lib/types";
import { DEFAULT_ENRICHMENT_CONFIG } from "@/lib/types";

/** Fallback-Defaults, falls DB-Eintrag fehlt */
const FALLBACK: Record<ServiceMode, EnrichmentConfig> = {
  recruiting: DEFAULT_ENRICHMENT_CONFIG,
  webdev: {
    contacts_management: true,
    contacts_hr: false,
    contacts_all: false,
    job_postings: false,
    career_page: false,
    company_details: true,
    capture_screenshot: true,
  },
};

/** Einzel-Default für einen Modus laden */
export async function getEnrichmentDefault(mode: ServiceMode): Promise<EnrichmentConfig> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("enrichment_defaults")
      .select("config")
      .eq("service_mode", mode)
      .single();
    // FALLBACK unten reinmergen, damit alte DB-Rows fehlende Felder
    // (z. B. capture_screenshot, das später hinzugefügt wurde) erben.
    return data?.config
      ? { ...FALLBACK[mode], ...(data.config as EnrichmentConfig) }
      : FALLBACK[mode];
  } catch {
    return FALLBACK[mode];
  }
}

/** Beide Defaults auf einmal laden (für Modal-Init) */
export async function getAllEnrichmentDefaults(): Promise<Record<ServiceMode, EnrichmentConfig>> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("enrichment_defaults")
      .select("service_mode, config");

    const map: Record<ServiceMode, EnrichmentConfig> = { ...FALLBACK };
    for (const row of data ?? []) {
      const mode = row.service_mode as ServiceMode;
      if (mode in map) map[mode] = { ...FALLBACK[mode], ...(row.config as EnrichmentConfig) };
    }
    return map;
  } catch {
    return { ...FALLBACK };
  }
}
