import { createClient } from "@/lib/supabase/server";
import type { RecruitingScoringConfig } from "@/lib/types";
import { DEFAULT_RECRUITING_SCORING } from "@/lib/types";

/** Lädt die Recruiting-Scoring-Konfig; Fallback auf Defaults */
export async function getRecruitingScoringConfig(): Promise<RecruitingScoringConfig> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("recruiting_scoring_config")
      .select("*")
      .eq("id", 1)
      .single();
    if (!data) return DEFAULT_RECRUITING_SCORING;
    return {
      min_job_postings_to_qualify: data.min_job_postings_to_qualify ?? DEFAULT_RECRUITING_SCORING.min_job_postings_to_qualify,
      require_hr_contact: data.require_hr_contact ?? DEFAULT_RECRUITING_SCORING.require_hr_contact,
      require_contact_email: data.require_contact_email ?? DEFAULT_RECRUITING_SCORING.require_contact_email,
    };
  } catch {
    return DEFAULT_RECRUITING_SCORING;
  }
}

const HR_ROLE_PATTERNS = [
  /personal/i,
  /\bhr\b/i,
  /human\s*resources/i,
  /recruit/i,
  /talent/i,
  /people/i,
  /ausbildung/i,
];

/** Prüft ob ein Kontakt eine HR-Rolle hat */
export function isHrContact(role: string | null | undefined): boolean {
  if (!role) return false;
  return HR_ROLE_PATTERNS.some((p) => p.test(role));
}
