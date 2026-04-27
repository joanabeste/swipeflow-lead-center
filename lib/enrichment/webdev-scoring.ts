import { createClient } from "@/lib/supabase/server";
import type { WebdevScoringConfig } from "@/lib/types";
import { DEFAULT_WEBDEV_SCORING } from "@/lib/types";

/** Lädt die Webdev-Scoring-Konfig; Fallback auf Defaults */
export async function getWebdevScoringConfig(): Promise<WebdevScoringConfig> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("webdev_scoring_config")
      .select("*")
      .eq("id", 1)
      .single();
    if (!data) return DEFAULT_WEBDEV_SCORING;
    return {
      strictness: data.strictness ?? DEFAULT_WEBDEV_SCORING.strictness,
      design_focus: data.design_focus ?? null,
      min_issues_to_qualify: data.min_issues_to_qualify ?? DEFAULT_WEBDEV_SCORING.min_issues_to_qualify,
      slow_load_threshold_ms: data.slow_load_threshold_ms ?? DEFAULT_WEBDEV_SCORING.slow_load_threshold_ms,
      very_slow_load_threshold_ms: data.very_slow_load_threshold_ms ?? DEFAULT_WEBDEV_SCORING.very_slow_load_threshold_ms,
      check_ssl: data.check_ssl ?? true,
      check_responsive: data.check_responsive ?? true,
      check_meta_tags: data.check_meta_tags ?? true,
      check_alt_tags: data.check_alt_tags ?? true,
      check_outdated_html: data.check_outdated_html ?? true,
      allow_leads_without_website: data.allow_leads_without_website ?? true,
    };
  } catch {
    return DEFAULT_WEBDEV_SCORING;
  }
}
