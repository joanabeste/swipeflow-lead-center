"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import { triggerCall, isPhoneMondoConfigured } from "@/lib/phonemondo/client";
import type { CallDirection, CallStatus } from "@/lib/types";

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
  if (error) return { error: error.message };

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
  if (error) return { error: error.message };

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
  if (error) return { error: error.message };

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

/** Startet einen ausgehenden Anruf über PhoneMondo und legt sofort einen
 *  lead_calls-Eintrag mit status='initiated' an. Status-Updates kommen dann
 *  per Webhook (siehe app/api/phonemondo/webhook/route.ts). */
export async function startCall(input: {
  leadId: string;
  contactId?: string | null;
  phoneNumber: string;
}) {
  const user = await currentUser();
  if (!user) return { error: "Nicht angemeldet." };

  if (!isPhoneMondoConfigured()) {
    return { error: "PhoneMondo ist nicht konfiguriert (PHONEMONDO_API_TOKEN fehlt)." };
  }

  const db = createServiceClient();
  const { data: profile } = await db
    .from("profiles")
    .select("phonemondo_extension")
    .eq("id", user.id)
    .single();
  const extension = profile?.phonemondo_extension?.trim();
  if (!extension) {
    return { error: "Keine PhoneMondo-Durchwahl in deinem Profil hinterlegt." };
  }
  if (!input.phoneNumber) {
    return { error: "Keine Telefonnummer vorhanden." };
  }

  let mondoCallId: string | null = null;
  try {
    const res = await triggerCall({
      target: input.phoneNumber,
      extension,
      metadata: { leadId: input.leadId, userId: user.id },
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
      mondo_call_id: mondoCallId,
      started_at: now,
      created_by: user.id,
    })
    .select()
    .single();
  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    action: "lead.call_logged",
    entityType: "lead",
    entityId: input.leadId,
    details: {
      call_id: callRow.id,
      mondo_call_id: mondoCallId,
      direction: "outbound",
      status: "initiated",
    },
  });

  revalidatePath(`/crm/${input.leadId}`);
  revalidatePath("/crm");
  return { success: true, callId: callRow.id, mondoCallId };
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
