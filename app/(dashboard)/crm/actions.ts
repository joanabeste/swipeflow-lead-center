"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import { triggerCall, isPhoneMondoConfigured } from "@/lib/phonemondo/client";
import { dialWebexCall } from "@/lib/webex/calling";
import { getWebexCredentials } from "@/lib/webex/auth";
import { normalizePhone, normalizeEmail, normalizeUrl, extractDomain } from "@/lib/csv/normalizer";
import { loadDecryptedSmtp } from "@/lib/email/user-credentials";
import { sendEmail } from "@/lib/email/smtp";
import type { CallDirection, CallStatus } from "@/lib/types";

export type CallProvider = "phonemondo" | "webex";

async function currentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function updateCrmStatus(leadId: string, statusId: string | null) {
  const user = await currentUser();
  if (!user) return { error: "Nicht angemeldet." };
  const db = createServiceClient();

  const { data: before } = await db
    .from("leads")
    .select("crm_status_id")
    .eq("id", leadId)
    .single();

  const { error } = await db
    .from("leads")
    .update({ crm_status_id: statusId, updated_at: new Date().toISOString() })
    .eq("id", leadId);
  if (error) {
    console.error("[updateCrmStatus] failed:", error);
    if (/column.*crm_status_id.*does not exist/i.test(error.message)) {
      return { error: "Spalte crm_status_id fehlt — Migration 017 muss in Supabase ausgeführt werden." };
    }
    return { error: `DB-Fehler: ${error.message}` };
  }

  await logAudit({
    userId: user.id,
    action: "lead.crm_status_changed",
    entityType: "lead",
    entityId: leadId,
    details: { old_status: before?.crm_status_id ?? null, new_status: statusId },
  });

  revalidatePath("/crm");
  revalidatePath(`/crm/${leadId}`);
  return { success: true };
}

export async function addNote(leadId: string, content: string) {
  const user = await currentUser();
  if (!user) return { error: "Nicht angemeldet." };
  if (!content.trim()) return { error: "Notiz darf nicht leer sein." };

  const db = createServiceClient();
  const { data, error } = await db
    .from("lead_notes")
    .insert({ lead_id: leadId, content: content.trim(), created_by: user.id })
    .select()
    .single();
  if (error) {
    console.error("[addNote] insert failed:", error);
    if (error.code === "42P01" || /relation.*does not exist/i.test(error.message)) {
      return { error: "Tabelle lead_notes fehlt — Migration 018 muss in Supabase ausgeführt werden." };
    }
    return { error: `DB-Fehler: ${error.message}` };
  }

  await logAudit({
    userId: user.id,
    action: "lead.note_added",
    entityType: "lead",
    entityId: leadId,
    details: { note_id: data.id },
  });

  revalidatePath(`/crm/${leadId}`);
  return { success: true, note: data };
}

export async function updateNote(noteId: string, leadId: string, content: string) {
  const user = await currentUser();
  if (!user) return { error: "Nicht angemeldet." };
  if (!content.trim()) return { error: "Notiz darf nicht leer sein." };

  const db = createServiceClient();
  const { error } = await db
    .from("lead_notes")
    .update({ content: content.trim(), updated_at: new Date().toISOString() })
    .eq("id", noteId);
  if (error) {
    console.error("[updateNote] failed:", error);
    return { error: `DB-Fehler: ${error.message}` };
  }

  await logAudit({
    userId: user.id,
    action: "lead.note_updated",
    entityType: "lead",
    entityId: leadId,
    details: { note_id: noteId },
  });

  revalidatePath(`/crm/${leadId}`);
  return { success: true };
}

export async function deleteNote(noteId: string, leadId: string) {
  const user = await currentUser();
  if (!user) return { error: "Nicht angemeldet." };
  const db = createServiceClient();

  const { error } = await db.from("lead_notes").delete().eq("id", noteId);
  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    action: "lead.note_deleted",
    entityType: "lead",
    entityId: leadId,
    details: { note_id: noteId },
  });

  revalidatePath(`/crm/${leadId}`);
  return { success: true };
}

export async function logCall(input: {
  leadId: string;
  contactId?: string | null;
  direction: CallDirection;
  status: CallStatus;
  durationSeconds?: number | null;
  notes?: string | null;
  phoneNumber?: string | null;
}) {
  const user = await currentUser();
  if (!user) return { error: "Nicht angemeldet." };
  const db = createServiceClient();

  const now = new Date().toISOString();
  const { data, error } = await db
    .from("lead_calls")
    .insert({
      lead_id: input.leadId,
      contact_id: input.contactId ?? null,
      direction: input.direction,
      status: input.status,
      duration_seconds: input.durationSeconds ?? null,
      notes: input.notes ?? null,
      phone_number: input.phoneNumber ?? null,
      started_at: now,
      ended_at: input.status === "ended" || input.status === "answered" ? now : null,
      created_by: user.id,
    })
    .select()
    .single();
  if (error) {
    console.error("[logCall] insert failed:", error);
    if (error.code === "42P01" || /relation.*does not exist/i.test(error.message)) {
      return { error: "Tabelle lead_calls fehlt — Migration 019 muss in Supabase ausgeführt werden." };
    }
    return { error: `DB-Fehler: ${error.message}` };
  }

  await logAudit({
    userId: user.id,
    action: "lead.call_logged",
    entityType: "lead",
    entityId: input.leadId,
    details: {
      call_id: data.id,
      direction: input.direction,
      status: input.status,
      duration_seconds: input.durationSeconds ?? null,
    },
  });

  revalidatePath(`/crm/${input.leadId}`);
  revalidatePath("/crm");
  return { success: true, call: data };
}

/** Startet einen ausgehenden Anruf über PhoneMondo ODER Webex (Default: PhoneMondo
 *  für Backwards-Compat). Legt sofort einen lead_calls-Eintrag mit
 *  status='initiated' + call_provider an. PhoneMondo-Status kommt per Webhook. */
export async function startCall(input: {
  leadId: string;
  contactId?: string | null;
  phoneNumber: string;
  provider?: CallProvider;
}) {
  const user = await currentUser();
  if (!user) return { error: "Nicht angemeldet." };
  if (!input.phoneNumber) return { error: "Keine Telefonnummer vorhanden." };

  const provider: CallProvider = input.provider ?? "phonemondo";
  return provider === "webex"
    ? startCallWebex({ ...input, userId: user.id })
    : startCallPhoneMondo({ ...input, userId: user.id });
}

async function startCallPhoneMondo(input: {
  leadId: string;
  contactId?: string | null;
  phoneNumber: string;
  userId: string;
}) {
  if (!isPhoneMondoConfigured()) {
    console.error("[startCall] PHONEMONDO_API_TOKEN fehlt im process.env.");
    return {
      error:
        "PhoneMondo ist nicht konfiguriert. Prüfe: Zeile 'PHONEMONDO_API_TOKEN=…' in .env.local vorhanden? Dev-Server nach Änderung neu gestartet (Ctrl+C + npm run dev)?",
    };
  }

  const db = createServiceClient();
  const { data: profile } = await db
    .from("profiles")
    .select("phonemondo_extension")
    .eq("id", input.userId)
    .single();
  const extension = profile?.phonemondo_extension?.trim();
  if (!extension) {
    return { error: "Keine PhoneMondo-Durchwahl in deinem Profil hinterlegt." };
  }

  let mondoCallId: string | null = null;
  try {
    const res = await triggerCall({
      target: input.phoneNumber,
      extension,
      metadata: { leadId: input.leadId, userId: input.userId },
    });
    mondoCallId = res.callId;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Anruf konnte nicht gestartet werden." };
  }

  const now = new Date().toISOString();
  const { data: callRow, error } = await db
    .from("lead_calls")
    .insert({
      lead_id: input.leadId,
      contact_id: input.contactId ?? null,
      direction: "outbound" as CallDirection,
      status: "initiated" as CallStatus,
      phone_number: input.phoneNumber,
      call_provider: "phonemondo",
      mondo_call_id: mondoCallId,
      started_at: now,
      created_by: input.userId,
    })
    .select()
    .single();
  if (error) return { error: error.message };

  await logAudit({
    userId: input.userId,
    action: "lead.call_logged",
    entityType: "lead",
    entityId: input.leadId,
    details: { call_id: callRow.id, mondo_call_id: mondoCallId, provider: "phonemondo", status: "initiated" },
  });

  revalidatePath(`/crm/${input.leadId}`);
  revalidatePath("/crm");
  return { success: true, callId: callRow.id, mondoCallId };
}

async function startCallWebex(input: {
  leadId: string;
  contactId?: string | null;
  phoneNumber: string;
  userId: string;
}) {
  const creds = await getWebexCredentials();
  if (!creds) return { error: "Webex nicht konfiguriert — Token in den Einstellungen hinterlegen." };
  if (creds.source === "db" && !creds.scopes.includes("spark:calls_write")) {
    return {
      error:
        "Webex-Token fehlt der Scope `spark:calls_write`. Neuen Token mit diesem Scope in developer.webex.com erstellen.",
    };
  }

  let webexCallId: string;
  try {
    const res = await dialWebexCall({ destination: input.phoneNumber });
    webexCallId = res.callId;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Webex-Anruf fehlgeschlagen." };
  }

  const db = createServiceClient();
  const now = new Date().toISOString();
  const { data: callRow, error } = await db
    .from("lead_calls")
    .insert({
      lead_id: input.leadId,
      contact_id: input.contactId ?? null,
      direction: "outbound" as CallDirection,
      status: "initiated" as CallStatus,
      phone_number: input.phoneNumber,
      call_provider: "webex",
      mondo_call_id: webexCallId, // spalte dient als generisches external-call-id
      started_at: now,
      created_by: input.userId,
    })
    .select()
    .single();
  if (error) return { error: error.message };

  await logAudit({
    userId: input.userId,
    action: "lead.call_logged",
    entityType: "lead",
    entityId: input.leadId,
    details: { call_id: callRow.id, webex_call_id: webexCallId, provider: "webex", status: "initiated" },
  });

  revalidatePath(`/crm/${input.leadId}`);
  revalidatePath("/crm");
  return { success: true, callId: callRow.id, webexCallId };
}

export async function createManualLead(input: {
  companyName: string;
  domain?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  industry?: string | null;
  companySize?: string | null;
  crmStatusId?: string | null;
}) {
  const user = await currentUser();
  if (!user) return { error: "Nicht angemeldet." };
  if (!input.companyName.trim()) return { error: "Firmenname fehlt." };

  const db = createServiceClient();
  const website = normalizeUrl(input.website ?? null);
  const domain = input.domain?.trim() || extractDomain(website) || extractDomain(input.email ?? null);

  const { data, error } = await db
    .from("leads")
    .insert({
      company_name: input.companyName.trim(),
      domain: domain || null,
      website: website,
      phone: normalizePhone(input.phone ?? null),
      email: normalizeEmail(input.email ?? null),
      street: input.street?.trim() || null,
      zip: input.zip?.trim() || null,
      city: input.city?.trim() || null,
      country: "Deutschland",
      industry: input.industry?.trim() || null,
      company_size: input.companySize?.trim() || null,
      source_type: "manual",
      status: "qualified",
      crm_status_id: input.crmStatusId || "todo",
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("[createManualLead] insert failed:", error);
    if (/constraint.*source_type/i.test(error.message)) {
      return { error: "Migration 021 muss in Supabase ausgeführt werden (source_type=manual)." };
    }
    if (/column.*crm_status_id/i.test(error.message)) {
      return { error: "Migration 017 muss in Supabase ausgeführt werden (crm_status_id)." };
    }
    return { error: `DB-Fehler: ${error.message}` };
  }

  await logAudit({
    userId: user.id,
    action: "lead.created_manual",
    entityType: "lead",
    entityId: data.id,
    details: { company_name: data.company_name, source: "crm" },
  });

  revalidatePath("/crm");
  revalidatePath("/leads");
  return { success: true, leadId: data.id as string };
}

// ─── Kontakte ────────────────────────────────────────────────

export async function addContact(input: {
  leadId: string;
  name: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
}) {
  const user = await currentUser();
  if (!user) return { error: "Nicht angemeldet." };
  if (!input.name.trim()) return { error: "Name fehlt." };
  const db = createServiceClient();
  const { error } = await db.from("lead_contacts").insert({
    lead_id: input.leadId,
    name: input.name.trim(),
    role: input.role?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    source_url: null,
  });
  if (error) {
    console.error("[addContact] failed:", error);
    return { error: `DB-Fehler: ${error.message}` };
  }
  revalidatePath(`/crm/${input.leadId}`);
  return { success: true };
}

export async function updateContact(contactId: string, leadId: string, input: {
  name: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
}) {
  const user = await currentUser();
  if (!user) return { error: "Nicht angemeldet." };
  const db = createServiceClient();
  const { error } = await db.from("lead_contacts").update({
    name: input.name.trim(),
    role: input.role?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
  }).eq("id", contactId);
  if (error) return { error: error.message };
  revalidatePath(`/crm/${leadId}`);
  return { success: true };
}

export async function deleteContact(contactId: string, leadId: string) {
  const user = await currentUser();
  if (!user) return { error: "Nicht angemeldet." };
  const db = createServiceClient();
  const { error } = await db.from("lead_contacts").delete().eq("id", contactId);
  if (error) return { error: error.message };
  revalidatePath(`/crm/${leadId}`);
  return { success: true };
}

// ─── Stellenanzeigen ──────────────────────────────────────────

export async function addJobPosting(input: {
  leadId: string;
  title: string;
  location?: string | null;
  url?: string | null;
}) {
  const user = await currentUser();
  if (!user) return { error: "Nicht angemeldet." };
  if (!input.title.trim()) return { error: "Titel fehlt." };
  const db = createServiceClient();
  const { error } = await db.from("lead_job_postings").insert({
    lead_id: input.leadId,
    title: input.title.trim(),
    location: input.location?.trim() || null,
    url: input.url?.trim() || null,
    posted_date: null,
    source: "manual",
  });
  if (error) {
    console.error("[addJobPosting] failed:", error);
    return { error: `DB-Fehler: ${error.message}` };
  }
  revalidatePath(`/crm/${input.leadId}`);
  return { success: true };
}

export async function deleteJobPosting(jobId: string, leadId: string) {
  const user = await currentUser();
  if (!user) return { error: "Nicht angemeldet." };
  const db = createServiceClient();
  const { error } = await db.from("lead_job_postings").delete().eq("id", jobId);
  if (error) return { error: error.message };
  revalidatePath(`/crm/${leadId}`);
  return { success: true };
}

export async function updateCallNotes(callId: string, leadId: string, notes: string) {
  const user = await currentUser();
  if (!user) return { error: "Nicht angemeldet." };
  const db = createServiceClient();

  const { error } = await db
    .from("lead_calls")
    .update({ notes, updated_at: new Date().toISOString() })
    .eq("id", callId);
  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    action: "lead.call_updated",
    entityType: "lead",
    entityId: leadId,
    details: { call_id: callId },
  });

  revalidatePath(`/crm/${leadId}`);
  return { success: true };
}

// ─── E-Mail-Versand an Lead-Kontakt ──────────────────────────

export async function sendLeadEmail(input: {
  leadId: string;
  contactId: string;
  subject: string;
  body: string;
}): Promise<{ success: true; messageId: string } | { error: string }> {
  const user = await currentUser();
  if (!user) return { error: "Nicht angemeldet." };

  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject) return { error: "Betreff fehlt." };
  if (!body) return { error: "Nachricht fehlt." };

  const smtp = await loadDecryptedSmtp(user.id);
  if (!smtp) {
    return {
      error: "Keine SMTP-Zugangsdaten hinterlegt. Richte sie unter Einstellungen → E-Mail (SMTP) ein.",
    };
  }

  const db = createServiceClient();
  const { data: contact } = await db
    .from("lead_contacts")
    .select("id, lead_id, email, name")
    .eq("id", input.contactId)
    .maybeSingle();
  if (!contact) return { error: "Kontakt nicht gefunden." };
  if (!contact.email) return { error: "Kontakt hat keine E-Mail-Adresse." };
  if ((contact.lead_id as string) !== input.leadId) {
    return { error: "Kontakt gehört nicht zu diesem Lead." };
  }

  const toEmail = contact.email as string;
  const result = await sendEmail(smtp, { to: toEmail, subject, body });

  if (!result.ok) {
    await db.from("email_messages").insert({
      lead_id: input.leadId,
      contact_id: input.contactId,
      sent_by: user.id,
      to_email: toEmail,
      from_email: smtp.fromEmail,
      subject,
      body,
      status: "failed",
      error: result.error,
    });
    await logAudit({
      userId: user.id,
      action: "email.send_failed",
      entityType: "lead",
      entityId: input.leadId,
      details: { to: toEmail, subject, error: result.error },
    });
    return { error: `Versand fehlgeschlagen: ${result.error}` };
  }

  await db.from("email_messages").insert({
    lead_id: input.leadId,
    contact_id: input.contactId,
    sent_by: user.id,
    to_email: toEmail,
    from_email: smtp.fromEmail,
    subject,
    body,
    status: "sent",
  });
  await logAudit({
    userId: user.id,
    action: "email.sent",
    entityType: "lead",
    entityId: input.leadId,
    details: { to: toEmail, subject, message_id: result.messageId },
  });

  revalidatePath(`/crm/${input.leadId}`);
  return { success: true, messageId: result.messageId };
}
