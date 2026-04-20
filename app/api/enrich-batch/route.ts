import { after } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { processEnrichmentJob } from "@/lib/enrichment/batch-worker";
import type { EnrichmentConfig, ServiceMode } from "@/lib/types";
import { DEFAULT_ENRICHMENT_CONFIG } from "@/lib/types";

export const maxDuration = 300;

/**
 * Startet einen Background-Enrichment-Job.
 *
 * - Legt `enrichment_jobs`-Row an, liefert `{ jobId }` zurück.
 * - Die eigentliche Verarbeitung läuft via `after()` nach dem Response-Send;
 *   Modal-Close / Browser-Disconnect unterbrechen den Job NICHT.
 * - Fortschritt: `GET /api/enrich-batch/status?id=<jobId>` (polling).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const body = await request.json();
  const leadIds: string[] = body.leadIds ?? [];
  const config: EnrichmentConfig = body.config ?? DEFAULT_ENRICHMENT_CONFIG;
  const serviceMode: ServiceMode = body.serviceMode ?? "recruiting";

  if (leadIds.length === 0) {
    return new Response("No lead IDs", { status: 400 });
  }

  const db = createServiceClient();
  const { data: job, error } = await db
    .from("enrichment_jobs")
    .insert({
      user_id: user.id,
      status: "pending",
      total: leadIds.length,
      processed: 0,
      config: config as unknown as Record<string, unknown>,
      service_mode: serviceMode,
      lead_ids: leadIds,
    })
    .select("id")
    .single();

  if (error || !job) {
    return new Response(`Job konnte nicht angelegt werden: ${error?.message ?? "unbekannt"}`, {
      status: 500,
    });
  }

  const jobId = job.id as string;

  // Hintergrund-Arbeit — läuft weiter nach Response-Send.
  after(async () => {
    try {
      await processEnrichmentJob(jobId);
    } catch {
      // Worker hat eigenen try/catch, aber double-safe hier.
    }
  });

  return Response.json({ jobId });
}
