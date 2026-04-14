// PhoneMondo-Integration — kapselt Click-to-Call + Webhook-Signatur-Prüfung.
//
// Die konkrete Endpoint-URL und der Payload-Shape werden in der API-Doku
// (https://www.phonemondo.com/res/apidoc/) festgelegt — trägst du den Token ein,
// passe ich diese Stelle mit dem echten Pfad an.
//
// Die Implementation ist absichtlich tolerant: fehlt der Token, gibt triggerCall
// einen konfigurations-Fehler zurück, damit der UI-Button eine klare Meldung zeigt.

import crypto from "node:crypto";
import type { PhoneMondoWebhookEvent, TriggerCallInput, TriggerCallResult, PhonemondoSource } from "./types";

// Offizielle API-Base-URL laut OpenAPI-Spec (https://www.phonemondo.com/res/apidoc/openapi.json).
const DEFAULT_BASE_URL = "https://www.phonemondo.com/api";

export function isPhoneMondoConfigured(): boolean {
  return !!process.env.PHONEMONDO_API_TOKEN;
}

/**
 * Löst einen Click-to-Call aus. Der Nutzer wird zuerst auf seiner Extension
 * angerufen und automatisch mit dem Ziel verbunden (so handhaben es die
 * meisten Telefonie-APIs).
 *
 * Sobald die offizielle API-Doku verfügbar ist: URL/Path + Payload-Keys unten
 * auf die dokumentierte Form bringen.
 */
export async function triggerCall(input: TriggerCallInput): Promise<TriggerCallResult> {
  const token = process.env.PHONEMONDO_API_TOKEN;
  if (!token) {
    throw new Error(
      "PhoneMondo nicht konfiguriert. Setze PHONEMONDO_API_TOKEN in den Umgebungsvariablen.",
    );
  }
  const baseUrl = (process.env.PHONEMONDO_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  // POST /sources/startcall?uid=<source-uid>&number=<target>
  // Parameter im Query-String (nicht Body), siehe OpenAPI-Spec.
  const params = new URLSearchParams({ uid: input.extension, number: input.target });
  const url = `${baseUrl}/sources/startcall?${params.toString()}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : "unbekannt";
    console.error("[phonemondo] triggerCall network error", { url, reason });
    throw new Error(
      `PhoneMondo unter ${url} nicht erreichbar (${reason}). Prüfe PHONEMONDO_API_BASE_URL in .env.local.`,
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("[phonemondo] triggerCall HTTP-Fehler", { url, status: response.status, body: text.slice(0, 500) });
    throw new Error(`PhoneMondo-Call fehlgeschlagen (HTTP ${response.status} bei ${url}): ${text.slice(0, 200)}`);
  }

  // Response kann unterschiedlich strukturiert sein. Wir probieren die typischen
  // Keys und loggen bei Fehlen die volle Antwort, damit die Zuordnung nachvollziehbar ist.
  const rawText = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    console.error("[phonemondo] triggerCall — non-JSON response", { url, body: rawText.slice(0, 500) });
    throw new Error(`PhoneMondo-Antwort nicht im JSON-Format: ${rawText.slice(0, 200)}`);
  }

  // PhoneMondo signalisiert App-Level-Fehler per HTTP 200 mit {"state":"err", code, msg}.
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    if (o.state === "err" || o.status === "err" || o.success === false) {
      const code = o.code ?? o.error_code ?? "ERR";
      const msg = o.msg ?? o.message ?? o.error ?? "unbekannt";
      console.error("[phonemondo] triggerCall — API-Error", { url, code, msg, body: rawText.slice(0, 300) });
      throw new Error(`PhoneMondo-API-Fehler (${code}): ${msg}. Endpoint ${url} prüfen.`);
    }
  }

  const callId = extractCallId(parsed);
  if (!callId) {
    console.error("[phonemondo] triggerCall — no call_id in response", {
      url,
      response: JSON.stringify(parsed).slice(0, 500),
    });
    throw new Error(
      "PhoneMondo-Antwort enthält keine erkennbare Call-ID. Response: " +
      JSON.stringify(parsed).slice(0, 300),
    );
  }
  return { callId };
}

/**
 * Holt alle Sources/Lines des Users via GET /sources/mine.
 * Eine Source entspricht einem Telefon/Endgerät im PhoneMondo-Account —
 * der User wählt eine aus, und ihre uid wird in profiles.phonemondo_extension
 * gespeichert.
 */
export async function listMySources(): Promise<PhonemondoSource[]> {
  const token = process.env.PHONEMONDO_API_TOKEN;
  if (!token) throw new Error("PhoneMondo nicht konfiguriert (PHONEMONDO_API_TOKEN fehlt).");
  const baseUrl = (process.env.PHONEMONDO_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const url = `${baseUrl}/sources/mine`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : "unbekannt";
    throw new Error(`PhoneMondo unter ${url} nicht erreichbar (${reason}).`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`PhoneMondo /sources/mine HTTP ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = (await response.json()) as
    | { state?: string; code?: string; msg?: string; items?: Array<Record<string, unknown>> }
    | Record<string, unknown>;

  const typed = data as Record<string, unknown>;
  if (typed.state === "err") {
    throw new Error(`PhoneMondo-Fehler (${typed.code ?? "ERR"}): ${typed.msg ?? "unbekannt"}`);
  }

  const items = Array.isArray(typed.items) ? (typed.items as Array<Record<string, unknown>>) : [];
  return items.map((item) => ({
    uid: String(item.uid ?? ""),
    label: String(item.label ?? item.identifier ?? item.uid ?? ""),
    identifier: typeof item.identifier === "string" ? item.identifier : undefined,
    enabled: typeof item.enabled === "number" ? item.enabled : undefined,
    deviceLabel:
      item.device && typeof item.device === "object" && "label" in item.device
        ? String((item.device as Record<string, unknown>).label ?? "")
        : undefined,
  }));
}

/** Sucht in einer typischerweise unbekannten API-Response nach einer Call-ID. */
function extractCallId(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  const candidates = [
    "call_id", "callId", "callID", "id",
    "uuid", "call_uuid", "callUuid",
    "session_id", "sessionId",
    "reference", "reference_id", "referenceId",
  ];
  const o = obj as Record<string, unknown>;
  for (const key of candidates) {
    const v = o[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  // In typischen REST-APIs ist das Objekt manchmal verschachtelt: { data: {...} }, { result: {...} }, { call: {...} }
  for (const wrap of ["data", "result", "call", "response"]) {
    const nested = o[wrap];
    if (nested && typeof nested === "object") {
      const inner = extractCallId(nested);
      if (inner) return inner;
    }
  }
  return null;
}

export type WebhookVerifyResult =
  | { ok: true; verified: true }
  | { ok: true; verified: false; reason: "no_secret_configured" }
  | { ok: false; reason: "missing_signature" | "bad_signature" };

/**
 * Prüft die Webhook-Signatur (HMAC-SHA256 über den Raw-Body).
 *
 * Ohne konfiguriertes Secret: Anfrage wird akzeptiert, aber nicht verifiziert.
 * Das ist eine pragmatische Einstellung — der User entscheidet, ob er Webhooks
 * signiert annehmen will oder nicht (PhoneMondo unterstützt möglicherweise
 * gar keine Signierung). Den Fall loggt der Endpoint deutlich.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): WebhookVerifyResult {
  const secret = process.env.PHONEMONDO_WEBHOOK_SECRET;
  if (!secret) {
    return { ok: true, verified: false, reason: "no_secret_configured" };
  }
  if (!signature) return { ok: false, reason: "missing_signature" };

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(signature.replace(/^sha256=/, ""), "hex");
    if (a.length !== b.length) return { ok: false, reason: "bad_signature" };
    const matches = crypto.timingSafeEqual(a, b);
    return matches ? { ok: true, verified: true } : { ok: false, reason: "bad_signature" };
  } catch {
    return { ok: false, reason: "bad_signature" };
  }
}

/**
 * Übersetzt das PhoneMondo-Event auf unseren internen lead_calls.status-Enum.
 */
export function mapEventToCallStatus(event: PhoneMondoWebhookEvent): {
  status: "ringing" | "answered" | "missed" | "failed" | "ended";
  hasEnded: boolean;
} {
  const key = `${event.event ?? ""}|${event.status ?? ""}`.toLowerCase();
  if (key.includes("ring")) return { status: "ringing", hasEnded: false };
  if (key.includes("miss")) return { status: "missed", hasEnded: true };
  if (key.includes("fail")) return { status: "failed", hasEnded: true };
  if (key.includes("answer")) return { status: "answered", hasEnded: false };
  if (key.includes("end") || key.includes("complete") || key.includes("hangup")) {
    return { status: "ended", hasEnded: true };
  }
  return { status: "ringing", hasEnded: false };
}
