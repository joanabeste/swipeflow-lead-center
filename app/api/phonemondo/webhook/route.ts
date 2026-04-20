import { createServiceClient } from "@/lib/supabase/server";
import { verifyWebhookSignature, mapEventToCallStatus } from "@/lib/phonemondo/client";
import { findLeadByPhone } from "@/lib/phonemondo/lead-match";
import { logAudit } from "@/lib/audit-log";
import type { PhoneMondoWebhookEvent } from "@/lib/phonemondo/types";

export const maxDuration = 30;

/**
 * Nimmt Call-Events von PhoneMondo entgegen.
 *
 * Update-Pfad: wenn ein lead_calls-Eintrag mit passender mondo_call_id existiert
 *   (z.B. durch ausgehenden Click-to-Call angelegt), wird Status/Dauer aktualisiert.
 *
 * Inbound-Auto-Create: wenn kein Eintrag existiert, aber das Event `direction=inbound`
 *   hat und die Anrufernummer einem Lead zugeordnet werden kann, wird ein neuer
 *   lead_calls-Eintrag angelegt (System-generated, created_by=null).
 *
 * Registrierung: https://<domain>/api/phonemondo/webhook
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  const signatureHeader =
    request.headers.get("x-phonemondo-signature") ??
    request.headers.get("x-signature") ??
    null;
  const verify = verifyWebhookSignature(rawBody, signatureHeader);
  if (!verify.ok) {
    return new Response(`Invalid signature: ${verify.reason}`, { status: 401 });
  }
  if (!verify.verified) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[phonemondo:webhook] Abgelehnt — PHONEMONDO_WEBHOOK_SECRET nicht gesetzt.",
      );
      return new Response("Webhook secret not configured", { status: 503 });
    }
    console.warn(
      "[phonemondo:webhook] Dev-Modus: Event ohne Signatur akzeptiert " +
      "(PHONEMONDO_WEBHOOK_SECRET nicht gesetzt).",
    );
  }

  let event: PhoneMondoWebhookEvent;
  try {
    event = JSON.parse(rawBody) as PhoneMondoWebhookEvent;
  } catch {
    console.error("[phonemondo:webhook:payload] Invalid JSON", { rawBody: rawBody.slice(0, 1000) });
    return new Response("Invalid JSON", { status: 400 });
  }

  // TEMP: Payload-Sichtung — loggt rohe Keys + Werte, damit wir die tatsächliche
  // Event-Shape von PhoneMondo mit unserem PhoneMondoWebhookEvent-Interface
  // abgleichen können. Nach ein paar echten Events wieder entfernen.
  console.log("[phonemondo:webhook:payload]", {
    keys: Object.keys(event as Record<string, unknown>),
    event,
  });

  if (!event.call_id) {
    return new Response("Missing call_id", { status: 400 });
  }

  const db = createServiceClient();
  const { data: existing } = await db
    .from("lead_calls")
    .select("id, lead_id, started_at")
    .eq("mondo_call_id", event.call_id)
    .maybeSingle();

  const mapped = mapEventToCallStatus(event);
  const nowIso = new Date().toISOString();
  const update: Record<string, unknown> = {
    status: mapped.status,
    updated_at: nowIso,
  };
  if (typeof event.duration_seconds === "number") update.duration_seconds = event.duration_seconds;
  if (event.ended_at) update.ended_at = event.ended_at;
  else if (mapped.hasEnded) update.ended_at = nowIso;

  if (existing) {
    await db.from("lead_calls").update(update).eq("id", existing.id);
    return Response.json({ ok: true, updated: existing.id });
  }

  // Kein bestehender Eintrag — prüfen, ob es ein Inbound-Rückruf ist und
  // die Anrufernummer einem bekannten Lead zugeordnet werden kann.
  if (event.direction === "inbound" && event.phone_number) {
    const match = await findLeadByPhone(event.phone_number);
    if (match) {
      const insertPayload = {
        lead_id: match.leadId,
        contact_id: match.contactId,
        direction: "inbound" as const,
        status: mapped.status,
        phone_number: event.phone_number,
        mondo_call_id: event.call_id,
        call_provider: "phonemondo",
        started_at: event.started_at ?? nowIso,
        ended_at: event.ended_at ?? (mapped.hasEnded ? nowIso : null),
        duration_seconds: typeof event.duration_seconds === "number" ? event.duration_seconds : null,
        created_by: null as string | null,
      };

      const { data: newCall, error: insertErr } = await db
        .from("lead_calls")
        .insert(insertPayload)
        .select("id")
        .single();

      if (insertErr) {
        // Race-Case: mondo_call_id ist unique; ein paralleles Event hat bereits
        // eingefügt. Erneut den Update-Pfad laufen lassen.
        console.warn(
          "[phonemondo:webhook] Inbound-Insert-Race, fallthrough auf Update:",
          insertErr.message,
        );
        const { data: raced } = await db
          .from("lead_calls")
          .select("id")
          .eq("mondo_call_id", event.call_id)
          .maybeSingle();
        if (raced) {
          await db.from("lead_calls").update(update).eq("id", raced.id);
          return Response.json({ ok: true, updated: raced.id, raced: true });
        }
      } else if (newCall) {
        await logAudit({
          userId: null,
          action: "lead.call_logged",
          entityType: "lead",
          entityId: match.leadId,
          details: {
            call_id: newCall.id,
            mondo_call_id: event.call_id,
            provider: "phonemondo",
            direction: "inbound",
            status: mapped.status,
            source: "webhook_auto",
          },
        });
        return Response.json({ ok: true, created: newCall.id, matched_lead: match.leadId });
      }
    }
  }

  // Event ohne bekannte Call-ID und ohne passenden Lead — still loggen.
  console.log("[phonemondo] Unbekannte call_id (kein Lead gematched):", event.call_id);
  return Response.json({ ok: true, unknown_call_id: event.call_id });
}
