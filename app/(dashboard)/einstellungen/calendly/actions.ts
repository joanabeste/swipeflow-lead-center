"use server";

import { revalidatePath } from "next/cache";
import { checkAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit-log";
import { createServiceClient } from "@/lib/supabase/server";
import {
  getCalendlyCredentials,
  saveCalendlyToken,
  saveCalendlyWebhook,
  deleteCalendlyCredentials,
  verifyCalendlyToken,
} from "@/lib/calendly/auth";
import {
  listEventTypes,
  registerWebhook,
  deleteWebhook,
  generateSigningKey,
} from "@/lib/calendly/client";
import type { CalendlyEventType } from "@/lib/calendly/types";

async function ensureAdmin() {
  const ctx = await checkAdmin();
  if (!ctx) return { error: "Nur Administratoren." as const };
  return { user: ctx.user };
}

/** Speichert den Personal Access Token (verschlüsselt) nach Live-Verifikation. */
export async function saveCalendlyTokenAction(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const check = await ensureAdmin();
  if ("error" in check) return { error: check.error };

  const token = ((formData.get("token") as string) ?? "").trim();
  if (!token) return { error: "Kein Token eingegeben." };

  const res = await saveCalendlyToken({ token, updatedBy: check.user.id });
  if (!res.ok) return { error: res.error };

  await logAudit({
    userId: check.user.id,
    action: "integrations.calendly.token_saved",
    entityType: "integration_credentials",
    details: { user_uri: res.verify.userUri, org_uri: res.verify.orgUri, email: res.verify.email },
  });

  revalidatePath("/einstellungen/calendly");
  revalidatePath("/admin/einstellungen/integrationen");
  return { success: true };
}

/** Registriert die Webhook-Subscription bei Calendly (eigener Signing-Key). */
export async function registerCalendlyWebhookAction(
  callbackUrl: string,
): Promise<{ error?: string; success?: boolean }> {
  const check = await ensureAdmin();
  if ("error" in check) return { error: check.error };

  const creds = await getCalendlyCredentials();
  if (!creds) return { error: "Kein Token hinterlegt." };
  if (!creds.orgUri || !creds.userUri) {
    return { error: "Organisation/User-URI fehlt — Token neu speichern (Verifikation gegen /users/me)." };
  }

  const signingKey = generateSigningKey();
  const reg = await registerWebhook({
    token: creds.token,
    callbackUrl,
    orgUri: creds.orgUri,
    userUri: creds.userUri,
    signingKey,
  });
  if (!reg.ok) return { error: reg.error };

  const saved = await saveCalendlyWebhook({
    signingKey,
    webhookUri: reg.webhookUri,
    callbackUrl,
    updatedBy: check.user.id,
  });
  if (!saved.ok) return { error: saved.error };

  await logAudit({
    userId: check.user.id,
    action: "integrations.calendly.webhook_registered",
    entityType: "integration_credentials",
    details: { webhook_uri: reg.webhookUri, callback_url: callbackUrl },
  });

  revalidatePath("/einstellungen/calendly");
  return { success: true };
}

/** Trennt die Integration: Webhook bei Calendly löschen + Credentials entfernen. */
export async function disconnectCalendlyAction(): Promise<{ error?: string; success?: boolean }> {
  const check = await ensureAdmin();
  if ("error" in check) return { error: check.error };

  const creds = await getCalendlyCredentials();
  if (creds?.webhookUri) {
    await deleteWebhook(creds.token, creds.webhookUri);
  }
  const res = await deleteCalendlyCredentials();
  if (!res.ok) return { error: res.error };

  await logAudit({
    userId: check.user.id,
    action: "integrations.calendly.disconnected",
    entityType: "integration_credentials",
  });

  revalidatePath("/einstellungen/calendly");
  revalidatePath("/admin/einstellungen/integrationen");
  return { success: true };
}

/** Lädt die Event-Typen live von Calendly (für die Mapping-Tabelle). */
export async function loadCalendlyEventTypesAction(): Promise<
  { ok: true; eventTypes: CalendlyEventType[] } | { ok: false; error: string }
> {
  const check = await ensureAdmin();
  if ("error" in check) return { ok: false, error: check.error as string };

  const creds = await getCalendlyCredentials();
  if (!creds) return { ok: false, error: "Kein Token hinterlegt." };
  // Verify liefert die aktuelle User-URI, falls meta sie (noch) nicht hat.
  let userUri: string | null = creds.userUri;
  if (!userUri) {
    const v = await verifyCalendlyToken(creds.token);
    if (!v.ok) return { ok: false, error: v.error };
    userUri = v.userUri;
  }
  if (!userUri) return { ok: false, error: "User-URI konnte nicht ermittelt werden." };
  try {
    const eventTypes = await listEventTypes(creds.token, userUri);
    return { ok: true, eventTypes: eventTypes.filter((e) => e.active) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unbekannter Fehler." };
  }
}

/** Speichert das Status-Mapping für einen Event-Typ. */
export async function saveEventMappingAction(input: {
  eventTypeUri: string;
  eventTypeName: string;
  bookedStatusId: string | null;
  canceledStatusId: string | null;
}): Promise<{ error?: string; success?: boolean }> {
  const check = await ensureAdmin();
  if ("error" in check) return { error: check.error };

  const db = createServiceClient();
  const { error } = await db.from("calendly_event_mappings").upsert(
    {
      event_type_uri: input.eventTypeUri,
      event_type_name: input.eventTypeName,
      booked_status_id: input.bookedStatusId,
      canceled_status_id: input.canceledStatusId,
      is_active: true,
      updated_by: check.user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_type_uri" },
  );
  if (error) return { error: error.message };

  revalidatePath("/einstellungen/calendly");
  return { success: true };
}
