import { createServiceClient } from "@/lib/supabase/server";
import { generateScoringSuggestion, type ReviewOutcome } from "@/lib/learning/scoring-reviewer";
import type { LeadVertical } from "@/lib/types";

export const maxDuration = 300;

/**
 * KI-Scoring-Reviewer.
 *
 * Geht pro Vertikale (`webdesign`, `recruiting`) durch positive vs. negative
 * Lead-Stichproben und erzeugt einen `scoring_suggestions`-Eintrag, der im
 * Settings-UI vom Admin reviewed wird.
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
  const results: Record<LeadVertical, ReviewOutcome> = {} as Record<LeadVertical, ReviewOutcome>;

  for (const vertical of verticals) {
    try {
      results[vertical] = await generateScoringSuggestion(vertical, db);
    } catch (e) {
      results[vertical] = {
        kind: "error",
        error: e instanceof Error ? e.message : "Unbekannter Fehler",
      };
    }
    console.log(`[scoring-review] ${vertical}:`, JSON.stringify(results[vertical]));
  }

  return Response.json({ results });
}

function authorized(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return header === `Bearer ${expected}`;
}
