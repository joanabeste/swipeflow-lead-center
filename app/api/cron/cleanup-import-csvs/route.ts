import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Loescht Original-CSVs, deren csv_expires_at abgelaufen ist. Entfernt
 * die Files aus dem `import-csvs`-Bucket und nullt den Pfad in import_logs.
 *
 * Trigger: Vercel Cron (Bearer `CRON_SECRET`).
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServiceClient();
  const { data: expired } = await db
    .from("import_logs")
    .select("id, csv_storage_path")
    .lt("csv_expires_at", new Date().toISOString())
    .not("csv_storage_path", "is", null);

  if (!expired || expired.length === 0) {
    return NextResponse.json({ deleted: 0 });
  }

  const paths = expired
    .map((e) => e.csv_storage_path as string | null)
    .filter((p): p is string => !!p);

  if (paths.length > 0) {
    await db.storage.from("import-csvs").remove(paths);
  }
  await db.from("import_logs")
    .update({ csv_storage_path: null })
    .in("id", expired.map((e) => e.id));

  console.log(`[cleanup-import-csvs] deleted ${expired.length} expired CSVs`);
  return NextResponse.json({ deleted: expired.length });
}

function authorized(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return header === `Bearer ${expected}`;
}
