"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { CallProvider } from "../crm/actions";
import { startCall as startCrmCall, updateCallNotes as updateCrmCallNotes } from "../crm/actions";

export type CallStatus =
  | "idle"
  | "initiated"
  | "ringing"
  | "answered"
  | "missed"
  | "failed"
  | "ended";

export interface QueueLead {
  id: string;
  company_name: string;
  phone: string | null;
  city: string | null;
  domain: string | null;
  crm_status_id: string | null;
  contact_name: string | null;
  contact_role: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_source_url: string | null;
  last_call_at: string | null;
}

/**
 * Lädt Queue-Kandidaten: qualifizierte/CRM-Leads mit Telefonnummer,
 * die in den letzten 60 Minuten nicht schon versucht wurden.
 * Sortiert nach letztem Kontakt (älteste zuerst).
 */
export async function loadCallQueue(): Promise<QueueLead[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const db = createServiceClient();
  const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();

  const { data: leads } = await db
    .from("leads")
    .select("id, company_name, phone, city, domain, crm_status_id, updated_at")
    .or("status.eq.qualified,crm_status_id.not.is.null")
    .not("phone", "is", null)
    .order("updated_at", { ascending: true })
    .limit(100);

  if (!leads || leads.length === 0) return [];

  // Letzten Call pro Lead laden, um kürzlich angerufene auszusortieren.
  const leadIds = leads.map((l) => l.id);
  const { data: recentCalls } = await db
    .from("lead_calls")
    .select("lead_id, started_at")
    .in("lead_id", leadIds)
    .gte("started_at", oneHourAgo)
    .order("started_at", { ascending: false });

  const recentlyCalled = new Set((recentCalls ?? []).map((c) => c.lead_id));

  // Primärkontakt pro Lead laden (erster Kontakt, HR bevorzugt).
  const { data: contacts } = await db
    .from("lead_contacts")
    .select("lead_id, name, role, phone, email, source_url, created_at")
    .in("lead_id", leadIds)
    .order("created_at", { ascending: true });

  const contactByLead = new Map<string, {
    name: string;
    role: string | null;
    phone: string | null;
    email: string | null;
    source_url: string | null;
  }>();
  for (const c of contacts ?? []) {
    if (!contactByLead.has(c.lead_id)) {
      contactByLead.set(c.lead_id, {
        name: c.name,
        role: c.role,
        phone: c.phone,
        email: c.email,
        source_url: c.source_url,
      });
    }
  }

  // Letzter Call pro Lead (für „last_call_at"-Badge).
  const { data: allLastCalls } = await db
    .from("lead_calls")
    .select("lead_id, started_at")
    .in("lead_id", leadIds)
    .order("started_at", { ascending: false });
  const lastCallByLead = new Map<string, string>();
  for (const c of allLastCalls ?? []) {
    if (!lastCallByLead.has(c.lead_id)) lastCallByLead.set(c.lead_id, c.started_at as string);
  }

  return leads
    .filter((l) => !recentlyCalled.has(l.id))
    .map((l): QueueLead => {
      const contact = contactByLead.get(l.id);
      return {
        id: l.id as string,
        company_name: l.company_name as string,
        phone: (l.phone as string | null) ?? null,
        city: (l.city as string | null) ?? null,
        domain: (l.domain as string | null) ?? null,
        crm_status_id: (l.crm_status_id as string | null) ?? null,
        contact_name: contact?.name ?? null,
        contact_role: contact?.role ?? null,
        contact_phone: contact?.phone ?? null,
        contact_email: contact?.email ?? null,
        contact_source_url: contact?.source_url ?? null,
        last_call_at: lastCallByLead.get(l.id) ?? null,
      };
    });
}

/**
 * Polling-Endpoint: aktueller Call-Status nach ID.
 * Wird von der Client-UI alle 2 Sekunden abgefragt, um Auto-Advance
 * zu triggern, sobald der PhoneMondo-Webhook den Status setzt.
 */
export async function getCallStatus(callId: string): Promise<{
  status: CallStatus;
  duration_seconds: number | null;
  ended_at: string | null;
} | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("lead_calls")
    .select("status, duration_seconds, ended_at")
    .eq("id", callId)
    .maybeSingle();
  if (!data) return null;
  return {
    status: (data.status as CallStatus) ?? "idle",
    duration_seconds: (data.duration_seconds as number | null) ?? null,
    ended_at: (data.ended_at as string | null) ?? null,
  };
}

/**
 * Dünner Wrapper um startCall — die Queue hat den gleichen Payload wie
 * der CRM-Dialog, aber einen eigenen Origin-Tag im Audit-Log.
 */
export async function queueStartCall(input: {
  leadId: string;
  phoneNumber: string;
  contactId?: string | null;
  provider?: CallProvider;
}): Promise<{ success: true; callId: string } | { error: string }> {
  const res = await startCrmCall(input);
  if ("error" in res && res.error) return { error: res.error };
  if ("callId" in res && res.callId) return { success: true, callId: res.callId };
  return { error: "Anruf konnte nicht gestartet werden." };
}

export async function queueUpdateNotes(
  callId: string,
  leadId: string,
  notes: string,
): Promise<{ success: true } | { error: string }> {
  const res = await updateCrmCallNotes(callId, leadId, notes);
  if (res.error) return { error: res.error };
  return { success: true };
}
