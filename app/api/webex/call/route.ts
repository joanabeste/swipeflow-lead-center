import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { dialWebexCall } from "@/lib/webex/calling";
import { getWebexCredentials } from "@/lib/webex/auth";
import { logAudit } from "@/lib/audit-log";

export const maxDuration = 15;

/**
 * POST /api/webex/call
 * Body: { leadId: string; phoneNumber: string; contactId?: string }
 *
 * Startet einen ausgehenden Anruf via Webex Calling (telephony/calls/dial)
 * und legt einen lead_calls-Eintrag mit status='initiated', call_provider='webex' an.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Nicht angemeldet." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { leadId?: string; phoneNumber?: string; contactId?: string | null }
    | null;
  const leadId = body?.leadId?.trim();
  const phoneNumber = body?.phoneNumber?.trim();
  const contactId = body?.contactId ?? null;
  if (!leadId || !phoneNumber) {
    return Response.json({ error: "leadId und phoneNumber sind Pflicht." }, { status: 400 });
  }

  const creds = await getWebexCredentials();
  if (!creds) {
    return Response.json(
      { error: "Webex nicht konfiguriert — Token in den Einstellungen hinterlegen." },
      { status: 503 },
    );
  }
  if (!creds.scopes.includes("spark:calls_write") && creds.source === "db") {
    return Response.json(
      {
        error:
          "Webex-Token fehlt der Scope `spark:calls_write`. Neuen Token mit diesem Scope in developer.webex.com erstellen.",
      },
      { status: 403 },
    );
  }

  let callId: string;
  try {
    const res = await dialWebexCall({ destination: phoneNumber });
    callId = res.callId;
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Anruf fehlgeschlagen" }, { status: 502 });
  }

  const db = createServiceClient();
  const now = new Date().toISOString();
  const { data: callRow, error } = await db
    .from("lead_calls")
    .insert({
      lead_id: leadId,
      contact_id: contactId,
      direction: "outbound",
      status: "initiated",
      phone_number: phoneNumber,
      call_provider: "webex",
      mondo_call_id: callId, // Wir nutzen die gleiche Spalte als externes Call-ID-Feld.
      started_at: now,
      created_by: user.id,
    })
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await logAudit({
    userId: user.id,
    action: "lead.call_logged",
    entityType: "lead",
    entityId: leadId,
    details: { call_id: callRow.id, webex_call_id: callId, provider: "webex", status: "initiated" },
  });

  revalidatePath(`/crm/${leadId}`);
  revalidatePath("/crm");
  return Response.json({ success: true, callId: callRow.id, webexCallId: callId });
}
