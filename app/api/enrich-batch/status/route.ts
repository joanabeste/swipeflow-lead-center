import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { EnrichJobResult } from "@/lib/enrichment/batch-worker";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return new Response("Missing id", { status: 400 });

  const db = createServiceClient();
  const { data: job } = await db
    .from("enrichment_jobs")
    .select(
      "id, user_id, status, total, processed, current_lead_name, results, last_error, created_at, completed_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!job) return new Response("Not found", { status: 404 });
  if (job.user_id !== user.id) return new Response("Forbidden", { status: 403 });

  return Response.json({
    id: job.id,
    status: job.status,
    total: job.total,
    processed: job.processed,
    currentLeadName: job.current_lead_name,
    results: (job.results as EnrichJobResult[]) ?? [],
    lastError: job.last_error,
    createdAt: job.created_at,
    completedAt: job.completed_at,
  });
}
