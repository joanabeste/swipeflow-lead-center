// Webex-Token-Verwaltung (DB-verschlüsselt, mit ENV-Fallback).
//
// Primärer Pfad: integration_credentials.provider='webex'.
// Fallback: Env-Var WEBEX_CALLING_TOKEN (Legacy).
//
// Token-Typ: Personal Access Token aus developer.webex.com — 12h Gültigkeit.
// Der Server verifiziert beim Speichern per /people/me + /admin/callingRecordings-Probe.

import { encryptSecret, decryptSecret } from "@/lib/crypto/secrets";
import { createServiceClient } from "@/lib/supabase/server";

const WEBEX_API_BASE = "https://webexapis.com/v1";

// Pflicht für Sync
export const WEBEX_REQUIRED_SCOPES = [
  "spark-admin:callingRecordings_read",
  "spark-admin:callingRecordings_download",
] as const;

// Optional — schalten Transkripte + Click-to-Call frei
export const WEBEX_OPTIONAL_SCOPES = [
  "spark-admin:transcripts_read",
  "spark:calls_write",
] as const;

export type WebexStoredCredentials = {
  token: string;
  expiresAt: Date | null;
  scopes: string[];
  lastVerifiedAt: Date | null;
  lastVerifyError: string | null;
  source: "db" | "env";
};

/**
 * Holt den aktiven Webex-Token. Liest zuerst aus DB (entschlüsselt),
 * fällt auf die ENV-Variable zurück. Wirft, wenn beides fehlt.
 */
export async function getWebexToken(): Promise<string> {
  const creds = await getWebexCredentials();
  if (!creds) {
    throw new Error(
      "Webex nicht konfiguriert — Token in den Einstellungen hinterlegen oder WEBEX_CALLING_TOKEN setzen.",
    );
  }
  return creds.token;
}

/** DB-Credentials + ENV-Fallback. Liefert null, wenn beides fehlt. */
export async function getWebexCredentials(): Promise<WebexStoredCredentials | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("integration_credentials")
    .select("token_encrypted, token_expires_at, scopes, last_verified_at, last_verify_error")
    .eq("provider", "webex")
    .maybeSingle();

  if (!error && data?.token_encrypted) {
    try {
      return {
        token: decryptSecret(data.token_encrypted),
        expiresAt: data.token_expires_at ? new Date(data.token_expires_at) : null,
        scopes: Array.isArray(data.scopes) ? data.scopes : [],
        lastVerifiedAt: data.last_verified_at ? new Date(data.last_verified_at) : null,
        lastVerifyError: data.last_verify_error ?? null,
        source: "db",
      };
    } catch (e) {
      console.error("[webex-auth] decrypt failed:", e);
      // Fall-through zu ENV — besser als gar kein Token.
    }
  }

  const env = process.env.WEBEX_CALLING_TOKEN;
  if (env) {
    return {
      token: env,
      expiresAt: null,
      scopes: [],
      lastVerifiedAt: null,
      lastVerifyError: null,
      source: "env",
    };
  }
  return null;
}

export async function isWebexConfigured(): Promise<boolean> {
  return (await getWebexCredentials()) !== null;
}

export type VerifyResult =
  | {
      ok: true;
      scopes: string[];
      personEmail: string | null;
      displayName: string | null;
      missingRequiredScopes: string[];
      hasTranscriptsScope: boolean;
      hasCallingScope: boolean;
    }
  | { ok: false; error: string; status?: number };

/**
 * Live-Probe: ruft GET /people/me. Antwort enthält den Token-Besitzer;
 * der Header `x-scope` (wenn verfügbar) listet die aktiven Scopes.
 * Wenn der Header fehlt, ziehen wir die Scopes aus dem ersten tatsächlichen
 * Endpoint-Test: 403 auf /admin/callingRecordings = Scope nicht da.
 */
export async function verifyWebexToken(token: string): Promise<VerifyResult> {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, error: "Token ist leer." };

  let meRes: Response;
  try {
    meRes = await fetch(`${WEBEX_API_BASE}/people/me`, {
      headers: { Authorization: `Bearer ${trimmed}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    return { ok: false, error: `Webex nicht erreichbar: ${e instanceof Error ? e.message : "unbekannt"}` };
  }

  if (meRes.status === 401) {
    return { ok: false, status: 401, error: "Token ungültig oder abgelaufen (401). Personal Access Tokens gelten nur 12h." };
  }
  if (!meRes.ok) {
    const body = await meRes.text().catch(() => "");
    return { ok: false, status: meRes.status, error: `Webex /people/me ${meRes.status}: ${body.slice(0, 200)}` };
  }

  const me = (await meRes.json().catch(() => ({}))) as {
    emails?: string[];
    displayName?: string;
  };

  // Scope-Abfrage: Webex gibt Scopes im Header `x-scope` zurück.
  const scopeHeader = meRes.headers.get("x-scope") ?? meRes.headers.get("X-Scope") ?? "";
  const scopes = scopeHeader
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const missingRequiredScopes = WEBEX_REQUIRED_SCOPES.filter((s) => !scopes.includes(s));
  const hasTranscriptsScope = scopes.includes("spark-admin:transcripts_read");
  const hasCallingScope = scopes.includes("spark:calls_write");

  return {
    ok: true,
    scopes,
    personEmail: me.emails?.[0] ?? null,
    displayName: me.displayName ?? null,
    missingRequiredScopes,
    hasTranscriptsScope,
    hasCallingScope,
  };
}

/**
 * Speichert einen Webex-Token verschlüsselt. Führt vorher eine Verifikation durch,
 * lehnt Speichern ab, wenn der Token nicht gültig ist oder Pflicht-Scopes fehlen.
 */
export async function saveWebexToken(input: {
  token: string;
  updatedBy: string | null;
  // PATs haben 12h TTL — bei Eingabe übernehmen wir das als Default,
  // OAuth-Tokens liefern ihre Expiry aus der Response.
  expiresAt?: Date | null;
}): Promise<{ ok: true; verify: Extract<VerifyResult, { ok: true }> } | { ok: false; error: string }> {
  const verify = await verifyWebexToken(input.token);
  if (!verify.ok) return { ok: false, error: verify.error };
  if (verify.missingRequiredScopes.length > 0) {
    return {
      ok: false,
      error: `Pflicht-Scopes fehlen: ${verify.missingRequiredScopes.join(", ")}. Token in developer.webex.com mit diesen Scopes neu erstellen.`,
    };
  }

  const db = createServiceClient();
  const expiresAt = input.expiresAt ?? new Date(Date.now() + 12 * 3600_000);

  const { error } = await db.from("integration_credentials").upsert(
    {
      provider: "webex",
      token_encrypted: encryptSecret(input.token),
      token_expires_at: expiresAt.toISOString(),
      scopes: verify.scopes,
      last_verified_at: new Date().toISOString(),
      last_verify_error: null,
      updated_by: input.updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider" },
  );
  if (error) return { ok: false, error: error.message };

  return { ok: true, verify };
}

export async function deleteWebexCredentials(): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = createServiceClient();
  const { error } = await db.from("integration_credentials").delete().eq("provider", "webex");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Markiert die letzte Verifikation erfolglos (z.B. wenn API 401 gibt). */
export async function markVerifyError(err: string): Promise<void> {
  const db = createServiceClient();
  await db
    .from("integration_credentials")
    .update({
      last_verified_at: new Date().toISOString(),
      last_verify_error: err.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("provider", "webex");
}
