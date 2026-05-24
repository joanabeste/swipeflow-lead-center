import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadLeadDetail } from "@/lib/leads/load-lead-detail";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const data = await loadLeadDetail(id);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Kurze private Cache-TTL erlaubt dem Browser, Hover-Prefetches und schnelles
  // Hin-und-Herklicken zwischen Leads aus dem Memory-Cache zu bedienen. Mutations
  // (Status-Updates, Notes etc.) laufen ueber Server-Actions die ohnehin den
  // Tree revalidieren, daher ist 30s sicher.
  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
  });
}
