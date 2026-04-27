"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import type { EnrichmentConfig, ServiceMode, WebdevStrictness } from "@/lib/types";
import {
  saveHqLocation as saveHqLocationHelper,
  saveCallQueueSettings as saveCallQueueSettingsHelper,
} from "@/lib/app-settings";
import { geocodeAddress } from "@/lib/geo/geocode";
import {
  saveWebexToken as saveWebexTokenHelper,
  deleteWebexCredentials as deleteWebexCredentialsHelper,
  verifyWebexToken,
  getWebexCredentials,
} from "@/lib/webex/auth";
import {
  createTemplate as createTemplateHelper,
  updateTemplate as updateTemplateHelper,
  deleteTemplate as deleteTemplateHelper,
} from "@/lib/email/templates-server";

export async function saveFieldProfile(
  _prev: { error?: string } | undefined,
  formData: FormData,
) {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  const name = formData.get("name") as string;
  const fields = formData.getAll("fields") as string[];
  const isDefault = formData.get("is_default") === "on";

  if (!name || fields.length === 0) {
    return { error: "Name und mindestens ein Pflichtfeld sind erforderlich." };
  }

  if (isDefault) {
    await db
      .from("required_field_profiles")
      .update({ is_default: false })
      .eq("is_default", true);
  }

  const { error } = await db.from("required_field_profiles").insert({
    name,
    required_fields: fields,
    is_default: isDefault,
    created_by: user?.id ?? null,
  });

  if (error) return { error: error.message };

  await logAudit({
    userId: user?.id ?? null,
    action: "settings.field_profile_created",
    entityType: "required_field_profile",
    details: { name, fields },
  });

  revalidatePath("/einstellungen");
  return { success: true } as { error?: string; success?: boolean };
}

type EnrichmentDefaultsState = { error?: string; success?: boolean; mode?: ServiceMode };

export async function saveEnrichmentDefaults(
  _prev: EnrichmentDefaultsState | undefined,
  formData: FormData,
): Promise<EnrichmentDefaultsState> {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Admin-Check
  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();

  if (profile?.role !== "admin") {
    return { error: "Nur Administratoren dürfen Defaults ändern." };
  }

  const mode = formData.get("mode") as ServiceMode;
  if (mode !== "recruiting" && mode !== "webdev") {
    return { error: "Ungültiger Modus." };
  }

  const config: EnrichmentConfig = {
    contacts_management: formData.get("contacts_management") === "on",
    contacts_hr: formData.get("contacts_hr") === "on",
    contacts_all: formData.get("contacts_all") === "on",
    job_postings: formData.get("job_postings") === "on",
    career_page: formData.get("career_page") === "on",
    company_details: formData.get("company_details") === "on",
  };

  const { error } = await db
    .from("enrichment_defaults")
    .upsert(
      {
        service_mode: mode,
        config: config as unknown as Record<string, unknown>,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "service_mode" },
    );

  if (error) return { error: error.message };

  await logAudit({
    userId: user?.id ?? null,
    action: "settings.enrichment_defaults_updated",
    entityType: "enrichment_defaults",
    details: { mode, config },
  });

  revalidatePath("/einstellungen");
  revalidatePath("/leads");
  return { success: true, mode };
}

export async function saveWebdevScoring(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();
  if (profile?.role !== "admin") {
    return { error: "Nur Administratoren dürfen die Webdesign-Bewertung ändern." };
  }

  const strictness = formData.get("strictness") as WebdevStrictness;
  if (!["lax", "normal", "strict"].includes(strictness)) {
    return { error: "Ungültige Strenge." };
  }

  const designFocus = (formData.get("design_focus") as string | null)?.trim() || null;
  const minIssues = Math.max(1, parseInt((formData.get("min_issues_to_qualify") as string) ?? "2", 10) || 2);
  const slowMs = Math.max(500, parseInt((formData.get("slow_load_threshold_s") as string) ?? "3", 10) * 1000);
  const verySlowMs = Math.max(slowMs + 500, parseInt((formData.get("very_slow_load_threshold_s") as string) ?? "5", 10) * 1000);

  const { error } = await db.from("webdev_scoring_config").upsert(
    {
      id: 1,
      strictness,
      design_focus: designFocus,
      min_issues_to_qualify: minIssues,
      slow_load_threshold_ms: slowMs,
      very_slow_load_threshold_ms: verySlowMs,
      check_ssl: formData.get("check_ssl") === "on",
      check_responsive: formData.get("check_responsive") === "on",
      check_meta_tags: formData.get("check_meta_tags") === "on",
      check_alt_tags: formData.get("check_alt_tags") === "on",
      check_outdated_html: formData.get("check_outdated_html") === "on",
      allow_leads_without_website: formData.get("allow_leads_without_website") === "on",
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) return { error: error.message };

  await logAudit({
    userId: user?.id ?? null,
    action: "settings.webdev_scoring_updated",
    entityType: "webdev_scoring_config",
    details: { strictness, minIssues, slowMs, verySlowMs, designFocus },
  });

  revalidatePath("/einstellungen");
  return { success: true };
}

export async function saveRecruitingScoring(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();
  if (profile?.role !== "admin") {
    return { error: "Nur Administratoren dürfen die Recruiting-Bewertung ändern." };
  }

  const minJobs = Math.max(0, parseInt((formData.get("min_job_postings_to_qualify") as string) ?? "1", 10) || 1);

  const { error } = await db.from("recruiting_scoring_config").upsert(
    {
      id: 1,
      min_job_postings_to_qualify: minJobs,
      require_hr_contact: formData.get("require_hr_contact") === "on",
      require_contact_email: formData.get("require_contact_email") === "on",
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) return { error: error.message };

  await logAudit({
    userId: user?.id ?? null,
    action: "settings.recruiting_scoring_updated",
    entityType: "recruiting_scoring_config",
    details: { minJobs },
  });

  revalidatePath("/einstellungen");
  return { success: true };
}

export async function saveHqLocation(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();
  if (profile?.role !== "admin") {
    return { error: "Nur Administratoren dürfen den Standort ändern." };
  }

  const label = ((formData.get("label") as string) ?? "").trim() || "Unser Standort";
  const address = ((formData.get("address") as string) ?? "").trim();
  if (!address) return { error: "Bitte eine Adresse eingeben." };

  const coords = await geocodeAddress(address);
  if (!coords) {
    return { error: "Adresse konnte nicht gefunden werden. Bitte genauer (z.B. Straße + PLZ + Ort)." };
  }

  await saveHqLocationHelper(
    { lat: coords.lat, lng: coords.lng, label, address },
    user?.id ?? null,
  );

  await logAudit({
    userId: user?.id ?? null,
    action: "settings.hq_location_updated",
    entityType: "app_settings",
    details: { label, address, lat: coords.lat, lng: coords.lng },
  });

  revalidatePath("/einstellungen");
  revalidatePath("/leads");
  return { success: true };
}

export async function deleteFieldProfile(id: string) {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  await db.from("required_field_profiles").delete().eq("id", id);

  await logAudit({
    userId: user?.id ?? null,
    action: "settings.field_profile_deleted",
    entityType: "required_field_profile",
    entityId: id,
  });

  revalidatePath("/einstellungen");
}

// ─── Custom Lead Status (CRM-Workflow) ───────────────────────────────

async function ensureAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." as const };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { error: "Nur Administratoren." as const };
  return { user };
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "status";
}

export async function saveCrmStatus(_prev: unknown, formData: FormData) {
  const check = await ensureAdmin();
  if ("error" in check) return { error: check.error };

  const db = createServiceClient();
  const id = (formData.get("id") as string | null)?.trim();
  const label = (formData.get("label") as string).trim();
  const color = ((formData.get("color") as string) || "#6b7280").trim();
  const description = ((formData.get("description") as string) || "").trim() || null;
  const displayOrder = parseInt((formData.get("display_order") as string) || "0", 10) || 0;
  const isActive = formData.get("is_active") === "on";

  if (!label) return { error: "Label fehlt." };

  if (id) {
    const { error } = await db
      .from("custom_lead_statuses")
      .update({
        label, color, description,
        display_order: displayOrder,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) return { error: error.message };
    await logAudit({
      userId: check.user.id,
      action: "custom_lead_status.updated",
      entityType: "custom_lead_status",
      entityId: id,
      details: { label },
    });
  } else {
    // Neuer Eintrag — ID aus Label ableiten; bei Kollision Suffix anhängen.
    let newId = slugify(label);
    for (let i = 2; i < 50; i++) {
      const { data: exists } = await db.from("custom_lead_statuses").select("id").eq("id", newId).maybeSingle();
      if (!exists) break;
      newId = `${slugify(label)}-${i}`;
    }
    const { error } = await db.from("custom_lead_statuses").insert({
      id: newId, label, color, description,
      display_order: displayOrder,
      is_active: isActive,
      created_by: check.user.id,
    });
    if (error) return { error: error.message };
    await logAudit({
      userId: check.user.id,
      action: "custom_lead_status.created",
      entityType: "custom_lead_status",
      entityId: newId,
      details: { label },
    });
  }

  revalidatePath("/einstellungen");
  revalidatePath("/crm");
  return { success: true };
}

export async function deleteCrmStatus(id: string) {
  const check = await ensureAdmin();
  if ("error" in check) return { error: check.error };

  const db = createServiceClient();
  const { error } = await db.from("custom_lead_statuses").delete().eq("id", id);
  if (error) return { error: error.message };

  await logAudit({
    userId: check.user.id,
    action: "custom_lead_status.deleted",
    entityType: "custom_lead_status",
    entityId: id,
  });

  revalidatePath("/einstellungen");
  revalidatePath("/crm");
  return { success: true };
}

// ─── PhoneMondo ──────────────────────────────────────────────

/** Triggert den Recording-Sync-Endpoint serverseitig (Admin-Aktion). */
export async function triggerRecordingSync(): Promise<
  { success: true; result: unknown } | { error: string }
> {
  const check = await ensureAdmin();
  if ("error" in check) return { error: check.error as string };

  const secret = process.env.WEBEX_CRON_SECRET ?? process.env.CRON_SECRET;
  if (!secret) return { error: "WEBEX_CRON_SECRET fehlt in den Environment-Variablen." };

  // Der Endpoint liegt in der gleichen App — ein interner fetch genügt.
  // VERCEL_URL enthält die aktuelle Deployment-Domain.
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  try {
    const res = await fetch(`${base}/api/webex/sync-recordings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(60_000),
    });
    const data = await res.json().catch(() => ({ error: "Non-JSON-Response" }));
    if (!res.ok) return { error: data.error ?? `HTTP ${res.status}` };
    return { success: true, result: data };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sync fehlgeschlagen" };
  }
}

// ─── Webex ───────────────────────────────────────────────────

export async function testWebexToken(
  token: string,
): Promise<
  | { ok: true; scopes: string[]; personEmail: string | null; displayName: string | null; missingRequiredScopes: string[]; hasTranscriptsScope: boolean; hasCallingScope: boolean }
  | { ok: false; error: string }
> {
  const check = await ensureAdmin();
  if ("error" in check) return { ok: false, error: check.error as string };
  const result = await verifyWebexToken(token);
  return result;
}

export async function saveWebexCredentials(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const check = await ensureAdmin();
  if ("error" in check) return { error: check.error };

  const token = ((formData.get("token") as string) ?? "").trim();
  if (!token) return { error: "Kein Token eingegeben." };

  const res = await saveWebexTokenHelper({ token, updatedBy: check.user.id });
  if (!res.ok) return { error: res.error };

  await logAudit({
    userId: check.user.id,
    action: "integrations.webex.token_saved",
    entityType: "integration_credentials",
    details: {
      scopes: res.verify.scopes,
      person_email: res.verify.personEmail,
      has_transcripts: res.verify.hasTranscriptsScope,
      has_calling: res.verify.hasCallingScope,
    },
  });

  revalidatePath("/einstellungen/webex");
  revalidatePath("/einstellungen");
  return { success: true };
}

export async function deleteWebexCredentials(): Promise<{ error?: string; success?: boolean }> {
  const check = await ensureAdmin();
  if ("error" in check) return { error: check.error };

  const res = await deleteWebexCredentialsHelper();
  if (!res.ok) return { error: res.error };

  await logAudit({
    userId: check.user.id,
    action: "integrations.webex.token_deleted",
    entityType: "integration_credentials",
  });

  revalidatePath("/einstellungen/webex");
  return { success: true };
}

/** Re-verifiziert den gespeicherten Token (Status-Refresh-Button). */
export async function reverifyWebex(): Promise<
  | { ok: true; scopes: string[]; personEmail: string | null; displayName: string | null; missingRequiredScopes: string[]; hasTranscriptsScope: boolean; hasCallingScope: boolean }
  | { ok: false; error: string }
> {
  const check = await ensureAdmin();
  if ("error" in check) return { ok: false, error: check.error as string };

  const stored = await getWebexCredentials();
  if (!stored) return { ok: false, error: "Kein Token gespeichert." };
  const result = await verifyWebexToken(stored.token);

  if (result.ok) {
    // Scopes + last_verified_at im DB-Eintrag aktualisieren.
    const db = createServiceClient();
    await db
      .from("integration_credentials")
      .update({
        scopes: result.scopes,
        last_verified_at: new Date().toISOString(),
        last_verify_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("provider", "webex");
  }
  return result;
}

// ─── Auto-Dialer / Call-Queue ────────────────────────────────

export async function saveCallQueueSettings(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const check = await ensureAdmin();
  if ("error" in check) return { error: check.error };

  const ringRaw = parseInt((formData.get("ring_timeout_seconds") as string) ?? "", 10);
  const advanceRaw = parseInt((formData.get("auto_advance_delay_seconds") as string) ?? "", 10);

  if (!Number.isFinite(ringRaw) || ringRaw < 5 || ringRaw > 120) {
    return { error: "Ring-Timeout muss zwischen 5 und 120 Sekunden liegen." };
  }
  if (!Number.isFinite(advanceRaw) || advanceRaw < 0 || advanceRaw > 30) {
    return { error: "Auto-Advance-Delay muss zwischen 0 und 30 Sekunden liegen." };
  }

  await saveCallQueueSettingsHelper(
    { ringTimeoutSeconds: ringRaw, autoAdvanceDelaySeconds: advanceRaw },
    check.user.id,
  );

  await logAudit({
    userId: check.user.id,
    action: "settings.call_queue_updated",
    entityType: "app_settings",
    details: { ringTimeoutSeconds: ringRaw, autoAdvanceDelaySeconds: advanceRaw },
  });

  revalidatePath("/einstellungen/anrufe");
  revalidatePath("/anrufe");
  return { success: true };
}

// ─── E-Mail-Vorlagen ──────────────────────────────────────────

function parseTemplateFormData(
  formData: FormData,
): { ok: true; input: { name: string; subject: string; body: string } } | { ok: false; error: string } {
  const name = ((formData.get("name") as string) ?? "").trim();
  const subject = ((formData.get("subject") as string) ?? "").trim();
  const body = ((formData.get("body") as string) ?? "").trim();
  if (!name) return { ok: false, error: "Name fehlt." };
  if (!subject) return { ok: false, error: "Betreff fehlt." };
  if (!body) return { ok: false, error: "Body fehlt." };
  if (name.length > 100) return { ok: false, error: "Name zu lang (max. 100 Zeichen)." };
  return { ok: true, input: { name, subject, body } };
}

export async function saveEmailTemplate(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const parsed = parseTemplateFormData(formData);
  if (!parsed.ok) return { error: parsed.error };

  const id = (formData.get("id") as string | null)?.trim() || null;
  if (id) {
    await updateTemplateHelper(id, user.id, parsed.input);
    await logAudit({
      userId: user.id,
      action: "email.template.updated",
      entityType: "email_template",
      entityId: id,
      details: { name: parsed.input.name },
    });
  } else {
    await createTemplateHelper(user.id, parsed.input);
    await logAudit({
      userId: user.id,
      action: "email.template.created",
      entityType: "email_template",
      details: { name: parsed.input.name },
    });
  }

  revalidatePath("/einstellungen/email-vorlagen");
  return { success: true };
}

export async function deleteEmailTemplate(id: string): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };
  await deleteTemplateHelper(id, user.id);
  await logAudit({
    userId: user.id,
    action: "email.template.deleted",
    entityType: "email_template",
    entityId: id,
  });
  revalidatePath("/einstellungen/email-vorlagen");
  return { success: true };
}

export async function setUserPhonemondoExtension(userId: string, extension: string | null) {
  const check = await ensureAdmin();
  if ("error" in check) return { error: check.error };

  const db = createServiceClient();
  const value = extension?.trim() || null;
  const { error } = await db
    .from("profiles")
    .update({ phonemondo_extension: value, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) return { error: error.message };

  await logAudit({
    userId: check.user.id,
    action: "phonemondo.extension_set",
    entityType: "profile",
    entityId: userId,
    details: { extension: value },
  });

  revalidatePath("/einstellungen");
  return { success: true };
}
