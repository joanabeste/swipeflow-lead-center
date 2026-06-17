import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Loescht abgelaufene Lead-Reservierungen (lead_qualify_claims). Reiner Backstop —
 * die Claim-Funktion gibt abgelaufene Reservierungen ohnehin bei jedem Aufruf frei;
 * dieser Cron haelt die Tabelle nur klein, falls niemand mehr qualifiziert.
 *
 * Trigger: Vercel Cron (Bearer `CRON_SECRET`).
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServiceClient();
  const nowIso = new Date().toISOString();
  const { data: expired } = await db
    .from("lead_qualify_claims")
    .select("lead_id")
    .lt("expires_at", nowIso);

  if (!expired || expired.length === 0) {
    return NextResponse.json({ deleted: 0 });
  }

  await db.from("lead_qualify_claims").delete().lt("expires_at", nowIso);

  console.log(`[cleanup-qualify-claims] deleted ${expired.length} expired claims`);
  return NextResponse.json({ deleted: expired.length });
}

function authorized(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return header === `Bearer ${expected}`;
}
