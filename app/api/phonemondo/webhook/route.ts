import { createServiceClient } from "@/lib/supabase/server";
import { verifyWebhookSignature, mapEventToCallStatus } from "@/lib/phonemondo/client";
import type { PhoneMondoWebhookEvent } from "@/lib/phonemondo/types";

export const maxDuration = 30;

/**
 * Nimmt Call-Events von PhoneMondo entgegen und aktualisiert den passenden
 * lead_calls-Eintrag anhand von mondo_call_id.
 *
 * Wird beim Provider unter einer öffentlichen URL registriert, z.B.:
 *   https://<deine-domain>/api/phonemondo/webhook
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
    // Kein Secret gesetzt — akzeptiere trotzdem, aber deutlich loggen.
    // Der Endpoint ist damit offen für jeden, der die URL kennt. Secret empfohlen.
    console.warn(
      "[phonemondo:webhook] Event wird ohne Signatur-Prüfung akzeptiert " +
      "(PHONEMONDO_WEBHOOK_SECRET nicht gesetzt).",
    );
  }

  let event: PhoneMondoWebhookEvent;
  try {
    event = JSON.parse(rawBody) as PhoneMondoWebhookEvent;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

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
  const update: Record<string, unknown> = {
    status: mapped.status,
    updated_at: new Date().toISOString(),
  };
  if (typeof event.duration_seconds === "number") update.duration_seconds = event.duration_seconds;
  if (event.ended_at) update.ended_at = event.ended_at;
  else if (mapped.hasEnded) update.ended_at = new Date().toISOString();

  if (existing) {
    await db.from("lead_calls").update(update).eq("id", existing.id);
    return Response.json({ ok: true, updated: existing.id });
  }

  // Event ohne bekannte Call-ID — loggen, aber nicht fatal. Könnte ein
  // eingehender Call sein, den wir nicht selbst initiiert haben.
  console.log("[phonemondo] Unbekannte call_id:", event.call_id);
  return Response.json({ ok: true, unknown_call_id: event.call_id });
}
