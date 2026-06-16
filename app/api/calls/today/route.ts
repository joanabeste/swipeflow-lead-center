import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { loadTodaysCalls, TODAY_CALLS_PAGE_SIZE } from "@/lib/calls/today";

/**
 * Paginierte Liste der heutigen Anrufe (alle Nutzer, ab 00:00 Berlin) für das
 * Dashboard-Widget „Heutige Anrufe". Die erste Seite kommt server-gerendert über
 * loadDashboardData; weitere Seiten holt das Widget hier nach.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
  const rawLimit = Number(url.searchParams.get("limit") ?? TODAY_CALLS_PAGE_SIZE) || TODAY_CALLS_PAGE_SIZE;
  const limit = Math.min(100, Math.max(1, rawLimit));

  const db = createServiceClient();
  const calls = await loadTodaysCalls(db, { offset, limit });

  return NextResponse.json({ calls }, {
    headers: { "Cache-Control": "private, max-age=15" },
  });
}
