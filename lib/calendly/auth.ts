// Calendly-Credential-Verwaltung (DB-verschlüsselt, mit ENV-Fallback).
//
// Primärer Pfad: integration_credentials.provider='calendly'.
//   • token_encrypted            → Personal Access Token (AES-256-GCM)
//   • meta.signing_key_encrypted → Webhook-Signing-Key (von uns generiert, verschlüsselt)
//   • meta.org_uri/user_uri      → aus GET /users/me (für Webhook-Registrierung + Event-Types)
//   • meta.webhook_uri           → URI des angelegten Webhook-Subscriptions (zum Löschen)
//   • meta.callback_url          → registrierte Callback-URL (Anzeige)
// Fallback: ENV CALENDLY_API_TOKEN / CALENDLY_WEBHOOK_SIGNING_KEY / CALENDLY_ORG_URI / CALENDLY_USER_URI.
//
// Token-Typ: Personal Access Token aus calendly.com (Integrations → API & Webhooks).

import { encryptSecret, decryptSecret } from "@/lib/crypto/secrets";
import { createServiceClient } from "@/lib/supabase/server";
import type { CalendlyCurrentUser } from "./types";

export const CALENDLY_API_BASE = "https://api.calendly.com";

type CalendlyMeta = {
  org_uri?: string | null;
  user_uri?: string | null;
  webhook_uri?: string | null;
  callback_url?: string | null;
  signing_key_encrypted?: string | null;
};

export type CalendlyStoredCredentials = {
  token: string;
  signingKey: string | null;
  orgUri: string | null;
  userUri: string | null;
  webhookUri: string | null;
  callbackUrl: string | null;
  lastVerifiedAt: Date | null;
  lastVerifyError: string | null;
  source: "db" | "env";
};

/** Holt das aktive Calendly-Credential-Bundle. DB zuerst, dann ENV-Fallback. */
export async function getCalendlyCredentials(): Promise<CalendlyStoredCredentials | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("integration_credentials")
    .select("token_encrypted, last_verified_at, last_verify_error, meta")
    .eq("provider", "calendly")
    .maybeSingle();

  if (!error && data?.token_encrypted) {
    try {
      const meta = (data.meta ?? {}) as CalendlyMeta;
      const signingKey = meta.signing_key_encrypted
        ? safeDecrypt(meta.signing_key_encrypted)
        : null;
      return {
        token: decryptSecret(data.token_encrypted),
        signingKey,
        orgUri: meta.org_uri ?? null,
        userUri: meta.user_uri ?? null,
        webhookUri: meta.webhook_uri ?? null,
        callbackUrl: meta.callback_url ?? null,
        lastVerifiedAt: data.last_verified_at ? new Date(data.last_verified_at) : null,
        lastVerifyError: data.last_verify_error ?? null,
        source: "db",
      };
    } catch (e) {
      console.error("[calendly-auth] decrypt failed:", e);
      // Fall-through zu ENV.
    }
  }

  const envToken = process.env.CALENDLY_API_TOKEN;
  if (envToken) {
    return {
      token: envToken,
      signingKey: process.env.CALENDLY_WEBHOOK_SIGNING_KEY ?? null,
      orgUri: process.env.CALENDLY_ORG_URI ?? null,
      userUri: process.env.CALENDLY_USER_URI ?? null,
      webhookUri: null,
      callbackUrl: null,
      lastVerifiedAt: null,
      lastVerifyError: null,
      source: "env",
    };
  }
  return null;
}

export async function isCalendlyConfigured(): Promise<boolean> {
  return (await getCalendlyCredentials()) !== null;
}

/** Wirft, wenn nicht konfiguriert. */
export async function getCalendlyToken(): Promise<string> {
  const creds = await getCalendlyCredentials();
  if (!creds) {
    throw new Error(
      "Calendly nicht konfiguriert — Token in den Einstellungen hinterlegen oder CALENDLY_API_TOKEN setzen.",
    );
  }
  return creds.token;
}

/** Signing-Key für die Webhook-Verifizierung (DB oder ENV), oder null. */
export async function getCalendlySigningKey(): Promise<string | null> {
  const creds = await getCalendlyCredentials();
  return creds?.signingKey ?? null;
}

export type CalendlyVerifyResult =
  | { ok: true; userUri: string; orgUri: string | null; email: string | null; name: string | null }
  | { ok: false; error: string; status?: number };

/** Live-Probe: GET /users/me. Liefert User-/Org-URI für Webhook-Registrierung. */
export async function verifyCalendlyToken(token: string): Promise<CalendlyVerifyResult> {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, error: "Token ist leer." };

  let res: Response;
  try {
    res = await fetch(`${CALENDLY_API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${trimmed}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    return { ok: false, error: `Calendly nicht erreichbar: ${e instanceof Error ? e.message : "unbekannt"}` };
  }

  if (res.status === 401) {
    return { ok: false, status: 401, error: "Token ungültig oder abgelaufen (401)." };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, status: res.status, error: `Calendly /users/me ${res.status}: ${body.slice(0, 200)}` };
  }

  const me = (await res.json().catch(() => null)) as CalendlyCurrentUser | null;
  const resource = me?.resource;
  if (!resource?.uri) {
    return { ok: false, error: "Unerwartete Antwort von /users/me (keine User-URI)." };
  }
  return {
    ok: true,
    userUri: resource.uri,
    orgUri: resource.current_organization ?? null,
    email: resource.email ?? null,
    name: resource.name ?? null,
  };
}

/**
 * Speichert einen Calendly-Token verschlüsselt. Verifiziert vorher gegen /users/me
 * und legt org/user-URI in meta ab (für spätere Webhook-Registrierung).
 * Bestehende meta-Felder (signing_key, webhook_uri …) bleiben erhalten.
 */
export async function saveCalendlyToken(input: {
  token: string;
  updatedBy: string | null;
}): Promise<{ ok: true; verify: Extract<CalendlyVerifyResult, { ok: true }> } | { ok: false; error: string }> {
  const verify = await verifyCalendlyToken(input.token);
  if (!verify.ok) return { ok: false, error: verify.error };

  const db = createServiceClient();
  const existingMeta = await loadMeta(db);
  const meta: CalendlyMeta = {
    ...existingMeta,
    org_uri: verify.orgUri,
    user_uri: verify.userUri,
  };

  const { error } = await db.from("integration_credentials").upsert(
    {
      provider: "calendly",
      token_encrypted: encryptSecret(input.token),
      scopes: [],
      last_verified_at: new Date().toISOString(),
      last_verify_error: null,
      meta,
      updated_by: input.updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true, verify };
}

/** Persistiert Webhook-Daten nach erfolgreicher Registrierung. */
export async function saveCalendlyWebhook(input: {
  signingKey: string;
  webhookUri: string;
  callbackUrl: string;
  updatedBy: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = createServiceClient();
  const existingMeta = await loadMeta(db);
  const meta: CalendlyMeta = {
    ...existingMeta,
    signing_key_encrypted: encryptSecret(input.signingKey),
    webhook_uri: input.webhookUri,
    callback_url: input.callbackUrl,
  };
  const { error } = await db
    .from("integration_credentials")
    .update({ meta, updated_by: input.updatedBy, updated_at: new Date().toISOString() })
    .eq("provider", "calendly");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteCalendlyCredentials(): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = createServiceClient();
  const { error } = await db.from("integration_credentials").delete().eq("provider", "calendly");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function markCalendlyVerifyError(err: string): Promise<void> {
  const db = createServiceClient();
  await db
    .from("integration_credentials")
    .update({
      last_verified_at: new Date().toISOString(),
      last_verify_error: err.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("provider", "calendly");
}

async function loadMeta(db: ReturnType<typeof createServiceClient>): Promise<CalendlyMeta> {
  const { data } = await db
    .from("integration_credentials")
    .select("meta")
    .eq("provider", "calendly")
    .maybeSingle();
  return (data?.meta ?? {}) as CalendlyMeta;
}

function safeDecrypt(encoded: string): string | null {
  try {
    return decryptSecret(encoded);
  } catch (e) {
    console.error("[calendly-auth] signing-key decrypt failed:", e);
    return null;
  }
}
