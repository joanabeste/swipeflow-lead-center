import { createClient, createServiceClient } from "@/lib/supabase/server";
import { verifyWebexToken, getWebexCredentials } from "@/lib/webex/auth";

export const maxDuration = 20;

/**
 * Testet einen Webex-Token via Live-API-Probe.
 * - Mit Body `{ token }`: prüft den übergebenen Token (Setup-Wizard).
 * - Ohne Body: prüft den aktuell gespeicherten Token (Re-Verify-Button).
 *
 * Admin-only (User-Session, nicht Cron).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Nicht angemeldet." }, { status: 401 });

  const db = createServiceClient();
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return Response.json({ error: "Nur Administratoren." }, { status: 403 });
  }

  let token: string | null = null;
  try {
    const body = (await request.json()) as { token?: string } | null;
    token = body?.token?.trim() || null;
  } catch {
    // Kein Body = gespeicherten Token prüfen.
  }

  if (!token) {
    const stored = await getWebexCredentials();
    if (!stored) return Response.json({ error: "Kein Token gespeichert." }, { status: 404 });
    token = stored.token;
  }

  const result = await verifyWebexToken(token);
  return Response.json(result);
}
