import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getScreenshotSignedUrl } from "@/lib/enrichment/screenshot";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const db = createServiceClient();
  const { data: lead } = await db
    .from("leads")
    .select("website_screenshot_path")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!lead) return NextResponse.json({ url: null });
  const path = (lead as { website_screenshot_path: string | null }).website_screenshot_path;
  const url = path ? await getScreenshotSignedUrl(path) : null;
  return NextResponse.json({ url });
}
