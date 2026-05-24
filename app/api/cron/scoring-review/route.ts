import { createServiceClient } from "@/lib/supabase/server";
import { generateScoringSuggestion, type ReviewOutcome } from "@/lib/learning/scoring-reviewer";
import { reviewFromOverrides, type OverrideReviewOutcome } from "@/lib/learning/override-reviewer";
import type { LeadVertical } from "@/lib/types";

export const maxDuration = 300;

/**
 * KI-Scoring-Reviewer.
 *
 * Zwei parallel laufende Lernpfade:
 *  1) crm_status: positive vs. negative CRM-Stichproben (alt, Sales-Outcome).
 *  2) override_rate: Cancel-Overrides der letzten 30 Tage (neu, passives Signal
 *     fuer Pre-CRM-Recherche-Qualitaet).
 *
 * Pfad 2 ist der Hauptsignalgeber fuer das Verbessern der initialen
 * Lead-Recherche — "kein Interesse" verfaelscht ihn nicht.
 *
 * Trigger: Vercel Cron (Bearer `CRON_SECRET`) oder manueller Admin-Button.
 */
export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

async function handle(request: Request) {
  if (!authorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = createServiceClient();
  const verticals: LeadVertical[] = ["webdesign", "recruiting"];
  const crmResults: Record<LeadVertical, ReviewOutcome> = {} as Record<LeadVertical, ReviewOutcome>;
  const overrideResults: Record<LeadVertical, OverrideReviewOutcome[]> = {} as Record<LeadVertical, OverrideReviewOutcome[]>;

  for (const vertical of verticals) {
    // CRM-Status-Pfad (Sales-Outcome) — bestehend
    try {
      crmResults[vertical] = await generateScoringSuggestion(vertical, db);
    } catch (e) {
      crmResults[vertical] = {
        kind: "error",
        error: e instanceof Error ? e.message : "Unbekannter Fehler",
      };
    }
    console.log(`[scoring-review][crm_status] ${vertical}:`, JSON.stringify(crmResults[vertical]));

    // Override-Pfad (Recherche-Qualitaet) — neu
    try {
      overrideResults[vertical] = await reviewFromOverrides(vertical, db);
    } catch (e) {
      overrideResults[vertical] = [{
        kind: "error",
        vertical,
        error: e instanceof Error ? e.message : "Unbekannter Fehler",
      }];
    }
    console.log(`[scoring-review][override_rate] ${vertical}:`, JSON.stringify(overrideResults[vertical]));
  }

  return Response.json({ crm_status: crmResults, override_rate: overrideResults });
}

function authorized(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return header === `Bearer ${expected}`;
}
