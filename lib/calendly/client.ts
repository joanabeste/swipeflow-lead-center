// Dünner Calendly-API-Wrapper + Webhook-Signaturprüfung.
// Referenz: https://developer.calendly.com/api-docs

import crypto from "node:crypto";
import { CALENDLY_API_BASE } from "./auth";
import type { CalendlyEventType, CalendlyWebhookEventName } from "./types";

export type CalendlyWebhookVerifyResult =
  | { ok: true; verified: true }
  | { ok: true; verified: false; reason: "no_signing_key" }
  | { ok: false; reason: "missing_signature" | "bad_format" | "bad_signature" };

/**
 * Prüft die Calendly-Webhook-Signatur.
 * Header-Format: `Calendly-Webhook-Signature: t=<unix-ts>,v1=<hmac-hex>`.
 * Signiert wird die Zeichenkette `${t}.${rawBody}` per HMAC-SHA256 mit dem
 * Signing-Key, den wir bei der Webhook-Registrierung selbst vergeben haben.
 *
 * Ohne Signing-Key (Dev / nicht registriert): akzeptiert, aber `verified:false`.
 */
export function verifyCalendlyWebhookSignature(
  rawBody: string,
  header: string | null,
  signingKey: string | null,
): CalendlyWebhookVerifyResult {
  if (!signingKey) return { ok: true, verified: false, reason: "no_signing_key" };
  if (!header) return { ok: false, reason: "missing_signature" };

  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const [k, ...rest] = kv.split("=");
      return [k.trim(), rest.join("=").trim()];
    }),
  ) as { t?: string; v1?: string };

  if (!parts.t || !parts.v1) return { ok: false, reason: "bad_format" };

  const expected = crypto
    .createHmac("sha256", signingKey)
    .update(`${parts.t}.${rawBody}`, "utf8")
    .digest("hex");

  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(parts.v1, "hex");
    if (a.length !== b.length) return { ok: false, reason: "bad_signature" };
    return crypto.timingSafeEqual(a, b)
      ? { ok: true, verified: true }
      : { ok: false, reason: "bad_signature" };
  } catch {
    return { ok: false, reason: "bad_signature" };
  }
}

async function calendlyFetch(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${CALENDLY_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
}

/** Listet aktive Event-Typen für den User (für die Mapping-UI). */
export async function listEventTypes(
  token: string,
  userUri: string,
): Promise<CalendlyEventType[]> {
  const out: CalendlyEventType[] = [];
  let pageUrl: string | null = `/event_types?user=${encodeURIComponent(userUri)}&count=100`;

  // Paginierung über Calendly-Cursor (pagination.next_page_token).
  while (pageUrl) {
    const res = await calendlyFetch(token, pageUrl);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Calendly /event_types ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      collection: CalendlyEventType[];
      pagination?: { next_page?: string | null };
    };
    out.push(...(json.collection ?? []));
    const next = json.pagination?.next_page;
    // next_page ist eine absolute URL; auf den Pfad+Query reduzieren.
    pageUrl = next ? next.replace(CALENDLY_API_BASE, "") : null;
  }
  return out;
}

/**
 * Registriert eine Webhook-Subscription. Der `signingKey` wird von uns vergeben
 * (Zufallswert) und muss identisch zur Verifizierung genutzt werden.
 * Liefert die URI der angelegten Subscription.
 */
export async function registerWebhook(input: {
  token: string;
  callbackUrl: string;
  orgUri: string;
  userUri: string;
  signingKey: string;
  events?: CalendlyWebhookEventName[];
}): Promise<{ ok: true; webhookUri: string } | { ok: false; error: string }> {
  const events = input.events ?? ["invitee.created", "invitee.canceled"];
  const res = await calendlyFetch(input.token, "/webhook_subscriptions", {
    method: "POST",
    body: JSON.stringify({
      url: input.callbackUrl,
      events,
      organization: input.orgUri,
      user: input.userUri,
      scope: "user",
      signing_key: input.signingKey,
    }),
  });

  if (res.status === 201 || res.ok) {
    const json = (await res.json().catch(() => null)) as { resource?: { uri?: string } } | null;
    const uri = json?.resource?.uri;
    if (!uri) return { ok: false, error: "Webhook angelegt, aber keine URI in der Antwort." };
    return { ok: true, webhookUri: uri };
  }

  const body = await res.text().catch(() => "");
  // 409 = Subscription für diese URL existiert bereits.
  return { ok: false, error: `Calendly /webhook_subscriptions ${res.status}: ${body.slice(0, 300)}` };
}

/** Löscht eine Webhook-Subscription (beim Trennen der Integration). */
export async function deleteWebhook(token: string, webhookUri: string): Promise<void> {
  const path = webhookUri.replace(CALENDLY_API_BASE, "");
  await calendlyFetch(token, path, { method: "DELETE" }).catch(() => {});
}

/** Erzeugt einen zufälligen Signing-Key für die Webhook-Registrierung. */
export function generateSigningKey(): string {
  return crypto.randomBytes(32).toString("hex");
}
