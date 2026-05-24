import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const db = createServiceClient();
  const { data: log } = await db
    .from("import_logs")
    .select("csv_storage_path, file_name")
    .eq("id", id)
    .maybeSingle();
  if (!log?.csv_storage_path) {
    return NextResponse.json({ error: "Keine CSV gespeichert" }, { status: 404 });
  }

  // Original-Dateiname fuer den Download-Header — Storage liefert sonst die
  // generische `<importlog-id>.csv` aus dem Pfad.
  const downloadName = (log.file_name as string | null)?.trim() || "import.csv";

  const { data: signed } = await db.storage
    .from("import-csvs")
    .createSignedUrl(log.csv_storage_path as string, 60, {
      download: downloadName,
    });
  if (!signed?.signedUrl) {
    return NextResponse.json({ error: "Signed-URL fehlgeschlagen" }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
