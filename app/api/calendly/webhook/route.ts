import { verifyCalendlyWebhookSignature } from "@/lib/calendly/client";
import { getCalendlySigningKey } from "@/lib/calendly/auth";
import { handleCalendlyEvent } from "@/lib/calendly/ingest";
import type { CalendlyWebhookEvent } from "@/lib/calendly/types";

export const maxDuration = 30;

/**
 * Nimmt Calendly-Events entgegen (invitee.created / invitee.canceled).
 *
 * Ablauf: Raw-Body lesen → HMAC-Signatur prüfen → Event verarbeiten
 *   (Lead matchen/anlegen, CRM-Status setzen, lead_appointments upserten, Historie).
 *
 * Registrierung: https://<domain>/api/calendly/webhook (über die Calendly-Settings).
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  const signingKey = await getCalendlySigningKey();
  const header = request.headers.get("calendly-webhook-signature");
  const verify = verifyCalendlyWebhookSignature(rawBody, header, signingKey);

  if (!verify.ok) {
    return new Response(`Invalid signature: ${verify.reason}`, { status: 401 });
  }
  if (!verify.verified) {
    if (process.env.NODE_ENV === "production") {
      console.error("[calendly:webhook] Abgelehnt — kein Signing-Key konfiguriert.");
      return new Response("Webhook signing key not configured", { status: 503 });
    }
    console.warn("[calendly:webhook] Dev-Modus: Event ohne Signatur akzeptiert (kein Signing-Key).");
  }

  let event: CalendlyWebhookEvent;
  try {
    event = JSON.parse(rawBody) as CalendlyWebhookEvent;
  } catch {
    console.error("[calendly:webhook] Invalid JSON", { rawBody: rawBody.slice(0, 500) });
    return new Response("Invalid JSON", { status: 400 });
  }

  try {
    const result = await handleCalendlyEvent(event);
    if (!result.ok) {
      console.warn("[calendly:webhook]", result.info);
      // 200 zurückgeben, damit Calendly nicht endlos retryt, wenn das Event
      // fachlich nicht verarbeitbar ist (z.B. fehlende invitee-URI).
      return Response.json({ ok: false, info: result.info });
    }
    return Response.json({ ok: true, info: result.info, leadId: result.leadId });
  } catch (e) {
    console.error("[calendly:webhook] handler error:", e);
    return new Response("Internal error", { status: 500 });
  }
}
