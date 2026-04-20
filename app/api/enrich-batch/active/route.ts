import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Aktive Enrichment-Jobs des eingeloggten Users.
 * Wird vom globalen Indicator in der Sidebar gepollt.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const db = createServiceClient();
  const { data: jobs } = await db
    .from("enrichment_jobs")
    .select("id, status, total, processed, current_lead_name, created_at")
    .eq("user_id", user.id)
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: false });

  return Response.json({
    jobs: (jobs ?? []).map((j) => ({
      id: j.id,
      status: j.status,
      total: j.total,
      processed: j.processed,
      currentLeadName: j.current_lead_name,
      createdAt: j.created_at,
    })),
  });
}
