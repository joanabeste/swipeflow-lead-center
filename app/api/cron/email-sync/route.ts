// Vercel-Cron: syncht alle User mit hinterlegten IMAP-Credentials.
// Konfiguration in vercel.json oder vercel.ts:
//   crons: [{ path: "/api/cron/email-sync", schedule: "*/5 * * * *" }]
// Auth: Vercel setzt automatisch Authorization: Bearer ${CRON_SECRET}, wenn
// CRON_SECRET als Env-Var gesetzt ist. Wir prüfen das hier.

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { syncUserMailbox } from "@/lib/email/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const db = createServiceClient();
  const { data: users } = await db
    .from("user_smtp_credentials")
    .select("user_id")
    .not("imap_host", "is", null);

  const results: Array<{ userId: string; ok: boolean; inbox?: number; sent?: number; error?: string }> = [];
  for (const u of users ?? []) {
    const userId = u.user_id as string;
    try {
      const res = await syncUserMailbox(userId);
      if (res.ok) results.push({ userId, ok: true, inbox: res.inbox, sent: res.sent });
      else results.push({ userId, ok: false, error: res.error });
    } catch (e) {
      results.push({ userId, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({
    syncedAt: new Date().toISOString(),
    userCount: results.length,
    results,
  });
}
