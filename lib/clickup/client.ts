// Schmaler fetch-Wrapper fuer die ClickUp REST-API.
// Doku: https://clickup.com/api

import { createServiceClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto/secrets";

const BASE = "https://api.clickup.com/api/v2";

export interface ClickupConfig {
  token: string;
  workspace_id?: string;
}

let cached: { value: ClickupConfig | null; at: number } | null = null;
const CACHE_TTL_MS = 60_000;

export async function loadClickupConfig(): Promise<ClickupConfig | null> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  const db = createServiceClient();
  const { data, error } = await db
    .from("app_integrations")
    .select("config_encrypted, workspace_id")
    .eq("provider", "clickup")
    .maybeSingle();
  if (error || !data?.config_encrypted) {
    cached = { value: null, at: Date.now() };
    return null;
  }
  try {
    const token = decryptSecret(data.config_encrypted as string);
    const value: ClickupConfig = { token, workspace_id: data.workspace_id ?? undefined };
    cached = { value, at: Date.now() };
    return value;
  } catch (e) {
    console.error("[loadClickupConfig] decrypt failed:", e);
    return null;
  }
}

export function invalidateClickupConfigCache() {
  cached = null;
}

export class ClickupError extends Error {
  constructor(public status: number, public body: string) {
    super(`ClickUp ${status}: ${body}`);
  }
}

export async function clickupFetch<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const token = init.token ?? (await loadClickupConfig())?.token;
  if (!token) throw new ClickupError(401, "Kein ClickUp-Token konfiguriert.");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: token,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new ClickupError(res.status, text);
  return text ? (JSON.parse(text) as T) : ({} as T);
}
