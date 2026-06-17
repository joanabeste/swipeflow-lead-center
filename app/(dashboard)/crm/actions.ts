"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checkSection } from "@/lib/auth";
import { logAudit } from "@/lib/audit-log";
import { triggerCall, isPhoneMondoConfigured } from "@/lib/phonemondo/client";
import { decryptSecret } from "@/lib/crypto/secrets";
import { dialWebexCall } from "@/lib/webex/calling";
import { getWebexCredentials } from "@/lib/webex/auth";
import { normalizePhone, normalizeEmail, normalizeUrl, extractDomain } from "@/lib/csv/normalizer";
import { loadDecryptedSmtp } from "@/lib/email/user-credentials";
import { sendEmail } from "@/lib/email/smtp";
import { listTemplates } from "@/lib/email/templates-server";
import type { EmailTemplate } from "@/lib/email/templates";
import type { CallDirection, CallStatus } from "@/lib/types";
import {
  createNoteAttachmentUploadTickets,
  deleteAttachmentsForNote,
  deleteNoteAttachment,
  registerNoteAttachment,
  type NoteAttachmentUploadTicket,
  type UploadedAttachmentRef,
} from "@/lib/notes/attachments";
import { awardCommissionsForStatusChange } from "@/lib/commission/award";
import { findExistingLeadForManual } from "@/lib/leads/find-existing";
import { detectLinkType } from "@/lib/leads/link-platforms";

export type CallProvider = "phonemondo" | "webex";

async function currentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function updateCrmStatus(leadId: string, statusId: string | null) {
  const ctx = await checkSection("can_vertrieb");
  if (!ctx) return { error: "Keine Berechtigung." };
  const user = ctx.user;
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

  // Provisions-Trigger. Idempotent (UNIQUE in 068); ein erneutes Setzen
  // desselben Status erzeugt kein zweites Event.
  const award = await awardCommissionsForStatusChange(db, leadId, statusId);
  if (award.error) {
    console.warn("[updateCrmStatus] commission award failed:", award.error);
    await logAudit({
      userId: user.id,
      action: "lead.commission_award_failed",
      entityType: "lead",
      entityId: leadId,
      details: { status_id: statusId, error: award.error },
    });
  }
  if (award.inserted > 0) {
    await logAudit({
      userId: user.id,
      action: "lead.commission_awarded",
      entityType: "lead",
      entityId: leadId,
      details: { count: award.inserted, status_id: statusId },
    });
    revalidatePath("/zeit/provision");
  }

  revalidatePath("/crm");
  revalidatePath(`/crm/${leadId}`);
  return { success: true };
}

export async function updateLeadAssignedTo(leadId: string, assignedTo: string | null) {
  const ctx = await checkSection("can_vertrieb");
  if (!ctx) return { error: "Keine Berechtigung." };
  const user = ctx.user;
  const db = createServiceClient();

  const { data: before } = await db
    .from("leads")
    .select("assigned_to")
    .eq("id", leadId)
    .single();

  const { error } = await db
    .from("leads")
    .update({ assigned_to: assignedTo, updated_at: new Date().toISOString() })
    .eq("id", leadId);
  if (error) {
    console.error("[updateLeadAssignedTo] failed:", error);
    if (/column.*assigned_to.*does not exist/i.test(error.message)) {
      return { error: "Spalte assigned_to fehlt — Migration 067 muss in Supabase ausgeführt werden." };
    }
    return { error: `DB-Fehler: ${error.message}` };
  }

  await logAudit({
    userId: user.id,
    action: "lead.assigned_to_changed",
    entityType: "lead",
    entityId: leadId,
    details: { old: (before as { assigned_to: string | null } | null)?.assigned_to ?? null, new: assignedTo },
  });

  revalidatePath("/crm");
  revalidatePath(`/crm/${leadId}`);
  return { success: true };
}

/**
 * Weist mehrere ausgewaehlte Leads gemeinsam einer Person zu (oder entfernt die
 * Zuordnung mit assignedTo=null). Wird aus der Bulk-Aktionsleiste im CRM gerufen.
 */
export async function bulkAssignLeads(ids: string[], assignedTo: string | null) {
  const ctx = await checkSection("can_vertrieb");
  if (!ctx) return { error: "Keine Berechtigung." };
  const user = ctx.user;
  if (ids.length === 0) return { success: true };
  const db = createServiceClient();

  const { data: before } = await db
    .from("leads")
    .select("id, assigned_to")
    .in("id", ids);
  const oldById = new Map(
    (before ?? []).map((r) => [r.id as string, (r.assigned_to as string | null) ?? null]),
  );

  const { error } = await db
    .from("leads")
    .update({ assigned_to: assignedTo, updated_at: new Date().toISOString() })
    .in("id", ids);
  if (error) {
    console.error("[bulkAssignLeads] failed:", error);
    if (/column.*assigned_to.*does not exist/i.test(error.message)) {
      return { error: "Spalte assigned_to fehlt — Migration 067 muss in Supabase ausgeführt werden." };
    }
    return { error: `DB-Fehler: ${error.message}` };
  }

  for (const id of ids) {
    await logAudit({
      userId: user.id,
      action: "lead.assigned_to_changed",
      entityType: "lead",
      entityId: id,
      details: { old: oldById.get(id) ?? null, new: assignedTo },
    });
  }

  revalidatePath("/crm");
  return { success: true };
}

/**
 * Setzt fuer mehrere ausgewaehlte Leads gemeinsam denselben CRM-Status. Ersetzt
 * den frueheren sequentiellen Loop in der UI (N Roundtrips + N revalidatePath)
 * durch genau einen Update, einen Audit-Bulk-Insert und einen revalidatePath.
 * Provisions-Awards laufen pro Lead, aber idempotent (UNIQUE in 068), und
 * Fehler werden nur gesammelt — sie blockieren den Status-Wechsel nicht.
 */
export async function bulkUpdateCrmStatus(
  ids: string[],
  statusId: string | null,
): Promise<
  | { success: true; updated: number; commissionErrors?: string[] }
  | { error: string }
> {
  const ctx = await checkSection("can_vertrieb");
  if (!ctx) return { error: "Keine Berechtigung." };
  const user = ctx.user;
  if (ids.length === 0) return { success: true, updated: 0 };
  const db = createServiceClient();

  const { data: before } = await db
    .from("leads")
    .select("id, crm_status_id")
    .in("id", ids);
  const oldById = new Map(
    (before ?? []).map((r) => [r.id as string, (r.crm_status_id as string | null) ?? null]),
  );

  const { error } = await db
    .from("leads")
    .update({ crm_status_id: statusId, updated_at: new Date().toISOString() })
    .in("id", ids);
  if (error) {
    console.error("[bulkUpdateCrmStatus] failed:", error);
    if (/column.*crm_status_id.*does not exist/i.test(error.message)) {
      return { error: "Spalte crm_status_id fehlt — Migration 017 muss in Supabase ausgeführt werden." };
    }
    return { error: `DB-Fehler: ${error.message}` };
  }

  // Audit-Inserts in einem einzigen Roundtrip statt N.
  const auditRows = ids.map((id) => ({
    user_id: user.id,
    action: "lead.crm_status_changed",
    entity_type: "lead",
    entity_id: id,
    details: { old_status: oldById.get(id) ?? null, new_status: statusId },
  }));
  if (auditRows.length > 0) {
    const { error: auditErr } = await db.from("audit_logs").insert(auditRows);
    if (auditErr) console.warn("[bulkUpdateCrmStatus] audit insert failed:", auditErr);
  }

  // Provisions-Trigger: pro Lead (Logik haengt vom Lead-Assignee ab).
  // UNIQUE(rule_id, lead_id) in Migration 068 macht den Aufruf idempotent.
  const commissionErrors: string[] = [];
  let anyAwarded = false;
  const awardAuditRows: {
    user_id: string;
    action: string;
    entity_type: string;
    entity_id: string;
    details: Record<string, unknown>;
  }[] = [];
  for (const id of ids) {
    const award = await awardCommissionsForStatusChange(db, id, statusId);
    if (award.error) {
      console.warn("[bulkUpdateCrmStatus] commission award failed:", id, award.error);
      commissionErrors.push(`${id}: ${award.error}`);
      awardAuditRows.push({
        user_id: user.id,
        action: "lead.commission_award_failed",
        entity_type: "lead",
        entity_id: id,
        details: { status_id: statusId, error: award.error },
      });
    } else if (award.inserted > 0) {
      anyAwarded = true;
      awardAuditRows.push({
        user_id: user.id,
        action: "lead.commission_awarded",
        entity_type: "lead",
        entity_id: id,
        details: { count: award.inserted, status_id: statusId },
      });
    }
  }
  if (awardAuditRows.length > 0) {
    const { error: awardAuditErr } = await db.from("audit_logs").insert(awardAuditRows);
    if (awardAuditErr) console.warn("[bulkUpdateCrmStatus] award-audit insert failed:", awardAuditErr);
  }
  if (anyAwarded) revalidatePath("/zeit/provision");

  revalidatePath("/crm");
  return {
    success: true,
    updated: ids.length,
    ...(commissionErrors.length > 0 ? { commissionErrors } : {}),
  };
}

/**
 * Vom Client aufgerufen, BEVOR die Dateien hochgeladen werden: erzeugt fuer jede
 * Datei eine signed Upload-URL, gegen die der Browser direkt PUTtet. Umgeht damit
 * das 4.5-MB-Function-Payload-Limit.
 */
export async function createNoteAttachmentUploads(
  leadId: string,
  files: { clientId: string; fileName: string; mimeType: string; sizeBytes: number }[],
): Promise<
  | { tickets: NoteAttachmentUploadTicket[]; errors: { clientId: string; error: string }[] }
  | { error: string }
> {
  const ctx = await checkSection("can_vertrieb");
  if (!ctx) return { error: "Keine Berechtigung." };
  if (files.length === 0) return { tickets: [], errors: [] };
  return createNoteAttachmentUploadTickets({ leadId, files });
}

export async function addNote(
  leadId: string,
  content: string,
  attachments: UploadedAttachmentRef[] = [],
) {
  const ctx = await checkSection("can_vertrieb");
  if (!ctx) return { error: "Keine Berechtigung." };
  const user = ctx.user;
  // Erlaube reine Datei-Notizen (z.B. nur Screenshot pasten): wenn Anhaenge da sind,
  // ist auch leerer Text ok.
  if (!content.trim() && attachments.length === 0) {
    return { error: "Notiz darf nicht leer sein." };
  }

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

  const uploadErrors: string[] = [];
  for (const ref of attachments) {
    const res = await registerNoteAttachment({
      leadId,
      noteId: data.id as string,
      userId: user.id,
      ref,
    });
    if ("error" in res) uploadErrors.push(`${ref.fileName}: ${res.error}`);
  }

  await logAudit({
    userId: user.id,
    action: "lead.note_added",
    entityType: "lead",
    entityId: leadId,
    details: { note_id: data.id, attachment_count: attachments.length },
  });

  revalidatePath(`/crm/${leadId}`);
  if (uploadErrors.length > 0) {
    return { success: true, note: data, warning: uploadErrors.join("; ") };
  }
  return { success: true, note: data };
}

export async function updateNote(
  noteId: string,
  leadId: string,
  content: string,
  addAttachments: UploadedAttachmentRef[] = [],
  removeAttachmentIds: string[] = [],
) {
  const ctx = await checkSection("can_vertrieb");
  if (!ctx) return { error: "Keine Berechtigung." };
  const user = ctx.user;
  if (!content.trim() && addAttachments.length === 0) {
    // Pruefen, ob nach dem Remove noch was uebrig bleibt — sonst ist die Notiz inhaltsleer.
    const db = createServiceClient();
    const { count } = await db
      .from("lead_note_attachments")
      .select("id", { count: "exact", head: true })
      .eq("note_id", noteId);
    const remaining = (count ?? 0) - removeAttachmentIds.length;
    if (remaining <= 0) return { error: "Notiz darf nicht leer sein." };
  }

  const db = createServiceClient();
  if (content.trim()) {
    const { error } = await db
      .from("lead_notes")
      .update({ content: content.trim(), updated_at: new Date().toISOString() })
      .eq("id", noteId);
    if (error) {
      console.error("[updateNote] failed:", error);
      return { error: `DB-Fehler: ${error.message}` };
    }
  } else {
    // Nur Anhaenge geaendert → updated_at trotzdem bumpen.
    await db
      .from("lead_notes")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", noteId);
  }

  const errors: string[] = [];
  for (const id of removeAttachmentIds) {
    const res = await deleteNoteAttachment(id);
    if (res.error) errors.push(`Loeschen fehlgeschlagen (${id}): ${res.error}`);
  }
  for (const ref of addAttachments) {
    const res = await registerNoteAttachment({
      leadId,
      noteId,
      userId: user.id,
      ref,
    });
    if ("error" in res) errors.push(`${ref.fileName}: ${res.error}`);
  }

  await logAudit({
    userId: user.id,
    action: "lead.note_updated",
    entityType: "lead",
    entityId: leadId,
    details: {
      note_id: noteId,
      attachments_added: addAttachments.length,
      attachments_removed: removeAttachmentIds.length,
    },
  });

  revalidatePath(`/crm/${leadId}`);
  if (errors.length > 0) return { success: true, warning: errors.join("; ") };
  return { success: true };
}

export async function deleteNote(noteId: string, leadId: string) {
  const ctx = await checkSection("can_vertrieb");
  if (!ctx) return { error: "Keine Berechtigung." };
  const user = ctx.user;
  const db = createServiceClient();

  // Storage-Objects vor DB-Delete entfernen (DB-CASCADE saeubert nur Tabellen-Rows).
  await deleteAttachmentsForNote(noteId);

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

// ─── Aufgaben / Wiedervorlagen ───────────────────────────────

export async function addLeadTodo(leadId: string, title: string, dueDate: string, dueTime?: string | null) {
  const ctx = await checkSection("can_vertrieb");
  if (!ctx) return { error: "Keine Berechtigung." };
  const user = ctx.user;
  const trimmed = title.trim();
  if (!trimmed) return { error: "Titel darf nicht leer sein." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { error: "Ungültiges Datum." };
  if (dueTime && !/^\d{2}:\d{2}$/.test(dueTime)) return { error: "Ungültige Uhrzeit." };

  const db = createServiceClient();
  const payload: Record<string, unknown> = { lead_id: leadId, title: trimmed, due_date: dueDate, created_by: user.id };
  // due_time nur schreiben, wenn gesetzt (siehe Migration 124).
  if (dueTime) payload.due_time = dueTime;
  const { data, error } = await db
    .from("lead_todos")
    .insert(payload)
    .select()
    .single();
  if (error) {
    console.error("[addLeadTodo] insert failed:", error);
    if (error.code === "42P01" || /relation.*does not exist/i.test(error.message)) {
      return { error: "Tabelle lead_todos fehlt — Migration 053 muss in Supabase ausgeführt werden." };
    }
    if (error.code === "42703" || /due_time/i.test(error.message)) {
      return { error: "Spalte due_time fehlt — Migration 124 muss in Supabase ausgeführt werden." };
    }
    return { error: `DB-Fehler: ${error.message}` };
  }

  await logAudit({
    userId: user.id,
    action: "lead.todo_added",
    entityType: "lead",
    entityId: leadId,
    details: { todo_id: data.id, due_date: dueDate, due_time: dueTime ?? null, title: trimmed },
  });

  revalidatePath(`/crm/${leadId}`);
  revalidatePath("/crm");
  revalidatePath("/");
  return { success: true, todo: data };
}

export async function updateLeadTodo(
  todoId: string,
  leadId: string,
  title: string,
  dueDate: string,
  dueTime?: string | null,
) {
  const ctx = await checkSection("can_vertrieb");
  if (!ctx) return { error: "Keine Berechtigung." };
  const user = ctx.user;
  const trimmed = title.trim();
  if (!trimmed) return { error: "Titel darf nicht leer sein." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { error: "Ungültiges Datum." };
  if (dueTime && !/^\d{2}:\d{2}$/.test(dueTime)) return { error: "Ungültige Uhrzeit." };

  const db = createServiceClient();
  const base = { title: trimmed, due_date: dueDate, updated_at: new Date().toISOString() };
  const payload: Record<string, unknown> = { ...base };
  if (dueTime !== undefined) payload.due_time = dueTime; // string oder null (= Uhrzeit leeren)
  let { error } = await db.from("lead_todos").update(payload).eq("id", todoId);
  if (error && (error.code === "42703" || /due_time/i.test(error.message))) {
    // Migration 124 noch nicht eingespielt.
    if (dueTime) return { error: "Spalte due_time fehlt — Migration 124 muss in Supabase ausgeführt werden." };
    // Zeitloses Update: due_time weglassen, damit Titel/Datum trotzdem speichern.
    ({ error } = await db.from("lead_todos").update(base).eq("id", todoId));
  }
  if (error) return { error: `DB-Fehler: ${error.message}` };

  await logAudit({
    userId: user.id,
    action: "lead.todo_updated",
    entityType: "lead",
    entityId: leadId,
    details: { todo_id: todoId, due_date: dueDate, due_time: dueTime ?? null, title: trimmed },
  });

  revalidatePath(`/crm/${leadId}`);
  revalidatePath("/crm");
  revalidatePath("/");
  return { success: true };
}

export async function toggleLeadTodo(todoId: string, leadId: string, done: boolean) {
  const ctx = await checkSection("can_vertrieb");
  if (!ctx) return { error: "Keine Berechtigung." };
  const user = ctx.user;
  const db = createServiceClient();
  const { error } = await db
    .from("lead_todos")
    .update({ done_at: done ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("id", todoId);
  if (error) return { error: `DB-Fehler: ${error.message}` };

  await logAudit({
    userId: user.id,
    action: done ? "lead.todo_completed" : "lead.todo_reopened",
    entityType: "lead",
    entityId: leadId,
    details: { todo_id: todoId },
  });

  revalidatePath(`/crm/${leadId}`);
  revalidatePath("/crm");
  revalidatePath("/");
  return { success: true };
}

export async function deleteLeadTodo(todoId: string, leadId: string) {
  const ctx = await checkSection("can_vertrieb");
  if (!ctx) return { error: "Keine Berechtigung." };
  const user = ctx.user;
  const db = createServiceClient();
  const { error } = await db.from("lead_todos").delete().eq("id", todoId);
  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    action: "lead.todo_deleted",
    entityType: "lead",
    entityId: leadId,
    details: { todo_id: todoId },
  });

  revalidatePath(`/crm/${leadId}`);
  revalidatePath("/crm");
  revalidatePath("/");
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
  const ctx = await checkSection("can_vertrieb");
  if (!ctx) return { error: "Keine Berechtigung." };
  const user = ctx.user;
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
  const ctx = await checkSection("can_vertrieb");
  if (!ctx) return { error: "Keine Berechtigung." };
  const user = ctx.user;
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
    .select("phonemondo_extension, phonemondo_api_token")
    .eq("id", input.userId)
    .single();
  const extension = profile?.phonemondo_extension?.trim();
  if (!extension) {
    return { error: "Keine PhoneMondo-Durchwahl in deinem Profil hinterlegt." };
  }

  // Eigener Token hat Vorrang; fehlt er, faellt triggerCall auf den Team-Token zurueck.
  let apiToken: string | undefined;
  if (profile?.phonemondo_api_token) {
    try {
      apiToken = decryptSecret(profile.phonemondo_api_token);
    } catch {
      return { error: "Dein PhoneMondo-Token konnte nicht entschluesselt werden — bitte in den Einstellungen neu hinterlegen." };
    }
  }

  let mondoCallId: string | null = null;
  try {
    const res = await triggerCall({
      target: input.phoneNumber,
      extension,
      apiToken,
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
  /** Akzeptiert volle URLs oder nackte Domain — wird intern zu Domain extrahiert. */
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  industry?: string | null;
  companySize?: string | null;
  crmStatusId?: string | null;
}): Promise<{ success: true; leadId: string } | { error: string; existingId?: string }> {
  const ctx = await checkSection("can_vertrieb");
  if (!ctx) return { error: "Keine Berechtigung." };
  const user = ctx.user;
  if (!input.companyName.trim()) return { error: "Firmenname fehlt." };

  const db = createServiceClient();
  const websiteInput = normalizeUrl(input.website ?? null);
  const websiteDomain = extractDomain(websiteInput) || extractDomain(input.email ?? null);

  const existingMatch = await findExistingLeadForManual(db, {
    company_name: input.companyName.trim(),
    website: websiteDomain,
    email: input.email ?? null,
    phone: input.phone ?? null,
    city: input.city ?? null,
  });
  if (existingMatch) {
    if (existingMatch.archived) {
      return {
        error:
          "Dieser Lead wurde im CRM aussortiert oder gelöscht und wird nicht erneut angelegt.",
      };
    }
    return {
      error: "Es existiert bereits ein Lead mit diesen Daten.",
      existingId: existingMatch.leadId,
    };
  }

  const { data, error } = await db
    .from("leads")
    .insert({
      company_name: input.companyName.trim(),
      website: websiteDomain || null,
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
  salutation?: "herr" | "frau" | null;
}): Promise<{ success: true; contactId: string } | { error: string }> {
  const ctx = await checkSection("can_vertrieb");
  if (!ctx) return { error: "Keine Berechtigung." };
  if (!input.name.trim()) return { error: "Name fehlt." };
  const { guessSalutationFromName } = await import("@/lib/contacts/salutation-from-name");
  const db = createServiceClient();
  const { data, error } = await db
    .from("lead_contacts")
    .insert({
      lead_id: input.leadId,
      name: input.name.trim(),
      role: input.role?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      // Wenn nicht explizit gesetzt, Heuristik aus dem Vornamen probieren —
      // so hat der User im Normalfall nichts zu tun.
      salutation: input.salutation ?? guessSalutationFromName(input.name),
      source_url: null,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[addContact] failed:", error);
    return { error: error?.message ? `DB-Fehler: ${error.message}` : "Konnte Kontakt nicht anlegen." };
  }
  revalidatePath(`/crm/${input.leadId}`);
  revalidatePath(`/leads/${input.leadId}`);
  return { success: true, contactId: data.id as string };
}

export async function updateContact(contactId: string, leadId: string, input: {
  name: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  salutation?: "herr" | "frau" | null;
}): Promise<{ success: true } | { error: string }> {
  const ctx = await checkSection("can_vertrieb");
  if (!ctx) return { error: "Keine Berechtigung." };
  const db = createServiceClient();
  const patch: Record<string, unknown> = {
    name: input.name.trim(),
    role: input.role?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
  };
  // salutation nur überschreiben, wenn das Feld übergeben wurde (auch null
  // ist gültig = "auf unbekannt zurücksetzen").
  if (input.salutation !== undefined) patch.salutation = input.salutation;
  const { error } = await db.from("lead_contacts").update(patch).eq("id", contactId);
  if (error) return { error: error.message };
  revalidatePath(`/crm/${leadId}`);
  revalidatePath(`/leads/${leadId}`);
  return { success: true };
}

/**
 * Nur Anrede eines Kontakts setzen — wird aus dem Send-Email-Dialog aufgerufen,
 * wenn der User die fehlende Anrede schnell nachträgt.
 */
export async function updateContactSalutation(
  contactId: string,
  salutation: "herr" | "frau" | null,
) {
  const ctx = await checkSection("can_vertrieb");
  if (!ctx) return { error: "Keine Berechtigung." };
  const db = createServiceClient();
  const { data, error } = await db
    .from("lead_contacts")
    .update({ salutation })
    .eq("id", contactId)
    .select("lead_id")
    .single();
  if (error) return { error: error.message };
  if (data?.lead_id) {
    revalidatePath(`/crm/${data.lead_id}`);
    revalidatePath(`/leads/${data.lead_id}`);
  }
  return { success: true };
}

export async function deleteContact(contactId: string, leadId: string): Promise<{ success: true } | { error: string }> {
  const ctx = await checkSection("can_vertrieb");
  if (!ctx) return { error: "Keine Berechtigung." };
  const db = createServiceClient();
  const { error } = await db.from("lead_contacts").delete().eq("id", contactId);
  if (error) return { error: error.message };
  revalidatePath(`/crm/${leadId}`);
  revalidatePath(`/leads/${leadId}`);
  return { success: true };
}

// ─── Lead-Links / Profile (zusätzliche Webseiten/Social) ──────

export async function addLeadLink(
  leadId: string,
  url: string,
  opts?: { type?: string; label?: string | null },
): Promise<{ success: true } | { error: string }> {
  const ctx = await checkSection("can_vertrieb");
  if (!ctx) return { error: "Keine Berechtigung." };
  const normalized = normalizeUrl(url);
  if (!normalized) return { error: "Ungültige URL." };
  const type = opts?.type?.trim() || detectLinkType(normalized);
  const db = createServiceClient();
  const { error } = await db.from("lead_links").upsert(
    {
      lead_id: leadId,
      url: normalized,
      type,
      label: opts?.label?.trim() || null,
      created_by: ctx.user.id,
    },
    { onConflict: "lead_id,url", ignoreDuplicates: true },
  );
  if (error) return { error: error.message };
  revalidatePath(`/crm/${leadId}`);
  revalidatePath(`/leads/${leadId}`);
  return { success: true };
}

export async function deleteLeadLink(
  linkId: string,
  leadId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await checkSection("can_vertrieb");
  if (!ctx) return { error: "Keine Berechtigung." };
  const db = createServiceClient();
  const { error } = await db.from("lead_links").delete().eq("id", linkId);
  if (error) return { error: error.message };
  revalidatePath(`/crm/${leadId}`);
  revalidatePath(`/leads/${leadId}`);
  return { success: true };
}

// ─── Stellenanzeigen ──────────────────────────────────────────

export async function addJobPosting(input: {
  leadId: string;
  title: string;
  location?: string | null;
  url?: string | null;
}) {
  const ctx = await checkSection("can_vertrieb");
  if (!ctx) return { error: "Keine Berechtigung." };
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
  revalidatePath(`/leads/${input.leadId}`);
  return { success: true };
}

export async function deleteJobPosting(jobId: string, leadId: string) {
  const ctx = await checkSection("can_vertrieb");
  if (!ctx) return { error: "Keine Berechtigung." };
  const db = createServiceClient();
  const { error } = await db.from("lead_job_postings").delete().eq("id", jobId);
  if (error) return { error: error.message };
  revalidatePath(`/crm/${leadId}`);
  revalidatePath(`/leads/${leadId}`);
  return { success: true };
}

export async function updateCallNotes(callId: string, leadId: string, notes: string) {
  const ctx = await checkSection("can_vertrieb");
  if (!ctx) return { error: "Keine Berechtigung." };
  const user = ctx.user;
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

// ─── E-Mail-Versand + Vorlagen ───────────────────────────────

/** Lädt die E-Mail-Vorlagen des aktuellen Users für den Send-Dialog. */
export async function loadMyEmailTemplates(): Promise<EmailTemplate[]> {
  const ctx = await checkSection("can_vertrieb");
  if (!ctx) return [];
  return listTemplates(ctx.user.id);
}



export async function sendLeadEmail(input: {
  leadId: string;
  contactId: string;
  subject: string;
  body: string;
}): Promise<{ success: true; messageId: string } | { error: string }> {
  const ctx = await checkSection("can_vertrieb");
  if (!ctx) return { error: "Keine Berechtigung." };
  const user = ctx.user;

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
