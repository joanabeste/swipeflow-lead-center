// Firmen-/Gläubigerdaten (SEPA) aus der DB, mit Env-Fallback. Server-only.
// Liest/schreibt über die Service-Role, da auch die öffentliche Signier-Route
// (/vertrag) die Gläubigerdaten fürs PDF braucht.

import { createServiceClient } from "@/lib/supabase/server";

export interface Creditor {
  id: string;
  name: string;
  address: string;
}

function envCreditor(): Creditor {
  return {
    id: process.env.SEPA_CREDITOR_ID ?? "",
    name: process.env.SEPA_CREDITOR_NAME ?? "swipeflow GmbH",
    address: process.env.SEPA_CREDITOR_ADDRESS ?? "Ringstraße 6, 32339 Espelkamp",
  };
}

/** Lädt die Gläubigerdaten: pro Feld DB-Wert, sonst Env-Fallback. */
export async function loadCreditor(): Promise<Creditor> {
  const env = envCreditor();
  const db = createServiceClient();
  const { data, error } = await db
    .from("company_settings")
    .select("sepa_creditor_id, sepa_creditor_name, sepa_creditor_address")
    .eq("id", "default")
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[loadCreditor]", error);
    return env;
  }
  const pick = (dbVal: string | null, fallback: string) => {
    const s = (dbVal ?? "").trim();
    return s.length > 0 ? s : fallback;
  };
  return {
    id: pick(data.sepa_creditor_id, env.id),
    name: pick(data.sepa_creditor_name, env.name),
    address: pick(data.sepa_creditor_address, env.address),
  };
}

export interface SaveCreditorInput {
  id: string;
  name: string;
  address: string;
  updatedBy: string | null;
}

/** Liest den Pfad der hinterlegten swipeflow-Unterschrift (oder null). */
export async function loadProviderSignaturePath(): Promise<string | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("company_settings")
    .select("provider_signature_path")
    .eq("id", "default")
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[loadProviderSignaturePath]", error);
    return null;
  }
  const path = (data.provider_signature_path ?? "").trim();
  return path.length > 0 ? path : null;
}

/** Speichert den Pfad der hinterlegten swipeflow-Unterschrift in der Singleton-Zeile. */
export async function saveProviderSignaturePath(
  path: string,
  updatedBy: string | null,
): Promise<{ error?: string }> {
  const db = createServiceClient();
  const { error } = await db.from("company_settings").upsert({
    id: "default",
    provider_signature_path: path,
    provider_signature_updated_at: new Date().toISOString(),
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("[saveProviderSignaturePath]", error);
    return { error: error.message };
  }
  return {};
}

/** Speichert die Gläubigerdaten in der Singleton-Zeile. Leere Felder → null (Env-Fallback). */
export async function saveCreditor(input: SaveCreditorInput): Promise<{ error?: string }> {
  const norm = (v: string) => {
    const s = v.trim();
    return s.length > 0 ? s : null;
  };
  const db = createServiceClient();
  const { error } = await db.from("company_settings").upsert({
    id: "default",
    sepa_creditor_id: norm(input.id),
    sepa_creditor_name: norm(input.name),
    sepa_creditor_address: norm(input.address),
    updated_by: input.updatedBy,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("[saveCreditor]", error);
    return { error: error.message };
  }
  return {};
}
