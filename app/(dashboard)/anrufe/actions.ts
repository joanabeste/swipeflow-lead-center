"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { CallProvider } from "../crm/actions";
import { startCall as startCrmCall, updateCallNotes as updateCrmCallNotes } from "../crm/actions";
import { getHqLocation } from "@/lib/app-settings";
import { haversineKm } from "@/lib/geo/distance";

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
  website: string | null;
  industry: string | null;
  career_page_url: string | null;
  distance_km: number | null;
  job_postings_count: number;
  last_call_status: string | null;
  last_call_notes: string | null;
  last_call_at: string | null;
  crm_status_id: string | null;
  crm_status_label: string | null;
  crm_status_color: string | null;
  contact_name: string | null;
  contact_role: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_source_url: string | null;
}

export interface CustomStatusOption {
  id: string;
  label: string;
  color: string;
}

/** Alle aktiven custom CRM-Status für den Queue-Status-Picker. */
export async function loadCustomStatuses(): Promise<CustomStatusOption[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("custom_lead_statuses")
    .select("id, label, color")
    .eq("is_active", true)
    .order("display_order", { ascending: true });
  return ((data ?? []) as CustomStatusOption[]);
}

/** User-spezifische Auswahl: welche Status landen in der Queue. */
export async function getCallQueueStatusIds(): Promise<string[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("profiles")
    .select("call_queue_status_ids")
    .eq("id", user.id)
    .single();
  return ((data?.call_queue_status_ids as string[] | null) ?? []);
}

/** Speichert die Queue-Status-Auswahl am eigenen Profil. */
export async function saveCallQueueStatusIds(
  ids: string[],
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const cleanIds = Array.from(new Set(ids.filter((x) => typeof x === "string" && x.trim().length > 0)));

  const db = createServiceClient();
  const { error } = await db
    .from("profiles")
    .update({ call_queue_status_ids: cleanIds, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/anrufe");
  return { success: true };
}

/**
 * Lädt Queue-Kandidaten: Leads, deren `crm_status_id` zur User-Auswahl
 * passt und die in den letzten 60 Minuten nicht schon versucht wurden.
 * Sortiert nach letztem Kontakt (älteste zuerst).
 */
export async function loadCallQueue(): Promise<QueueLead[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("call_queue_status_ids")
    .eq("id", user.id)
    .single();
  const statusIds = ((profile?.call_queue_status_ids as string[] | null) ?? []).filter(Boolean);
  if (statusIds.length === 0) return [];

  const db = createServiceClient();
  const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();

  const { data: leads } = await db
    .from("leads")
    .select(
      "id, company_name, phone, city, domain, website, industry, career_page_url, latitude, longitude, crm_status_id, updated_at",
    )
    .in("crm_status_id", statusIds)
    .not("phone", "is", null)
    .order("updated_at", { ascending: true })
    .limit(100);

  if (!leads || leads.length === 0) return [];

  const leadIds = leads.map((l) => l.id);

  const [
    recentCallsRes,
    contactsRes,
    allLastCallsRes,
    jobPostingsRes,
    statusesRes,
    hq,
  ] = await Promise.all([
    db
      .from("lead_calls")
      .select("lead_id, started_at")
      .in("lead_id", leadIds)
      .gte("started_at", oneHourAgo),
    db
      .from("lead_contacts")
      .select("lead_id, name, role, phone, email, source_url, created_at")
      .in("lead_id", leadIds)
      .order("created_at", { ascending: true }),
    db
      .from("lead_calls")
      .select("lead_id, started_at, status, notes")
      .in("lead_id", leadIds)
      .order("started_at", { ascending: false }),
    db
      .from("lead_job_postings")
      .select("lead_id")
      .in("lead_id", leadIds),
    db
      .from("custom_lead_statuses")
      .select("id, label, color")
      .in("id", statusIds),
    getHqLocation(),
  ]);

  const recentlyCalled = new Set((recentCallsRes.data ?? []).map((c) => c.lead_id as string));

  const contactByLead = new Map<string, {
    name: string;
    role: string | null;
    phone: string | null;
    email: string | null;
    source_url: string | null;
  }>();
  for (const c of contactsRes.data ?? []) {
    if (!contactByLead.has(c.lead_id as string)) {
      contactByLead.set(c.lead_id as string, {
        name: c.name as string,
        role: (c.role as string | null) ?? null,
        phone: (c.phone as string | null) ?? null,
        email: (c.email as string | null) ?? null,
        source_url: (c.source_url as string | null) ?? null,
      });
    }
  }

  const lastCallByLead = new Map<string, {
    started_at: string;
    status: string | null;
    notes: string | null;
  }>();
  for (const c of allLastCallsRes.data ?? []) {
    if (!lastCallByLead.has(c.lead_id as string)) {
      lastCallByLead.set(c.lead_id as string, {
        started_at: c.started_at as string,
        status: (c.status as string | null) ?? null,
        notes: (c.notes as string | null) ?? null,
      });
    }
  }

  const jobCountByLead = new Map<string, number>();
  for (const j of jobPostingsRes.data ?? []) {
    const id = j.lead_id as string;
    jobCountByLead.set(id, (jobCountByLead.get(id) ?? 0) + 1);
  }

  const statusMeta = new Map<string, { label: string; color: string }>();
  for (const s of statusesRes.data ?? []) {
    statusMeta.set(s.id as string, {
      label: s.label as string,
      color: s.color as string,
    });
  }

  return leads
    .filter((l) => !recentlyCalled.has(l.id as string))
    .map((l): QueueLead => {
      const contact = contactByLead.get(l.id as string);
      const lastCall = lastCallByLead.get(l.id as string);
      const meta = l.crm_status_id ? statusMeta.get(l.crm_status_id as string) ?? null : null;
      let distance: number | null = null;
      if (hq && typeof l.latitude === "number" && typeof l.longitude === "number") {
        distance = Math.round(
          haversineKm({ lat: hq.lat, lng: hq.lng }, { lat: l.latitude, lng: l.longitude }) * 10,
        ) / 10;
      }
      return {
        id: l.id as string,
        company_name: l.company_name as string,
        phone: (l.phone as string | null) ?? null,
        city: (l.city as string | null) ?? null,
        domain: (l.domain as string | null) ?? null,
        website: (l.website as string | null) ?? null,
        industry: (l.industry as string | null) ?? null,
        career_page_url: (l.career_page_url as string | null) ?? null,
        distance_km: distance,
        job_postings_count: jobCountByLead.get(l.id as string) ?? 0,
        last_call_status: lastCall?.status ?? null,
        last_call_notes: lastCall?.notes ?? null,
        last_call_at: lastCall?.started_at ?? null,
        crm_status_id: (l.crm_status_id as string | null) ?? null,
        crm_status_label: meta?.label ?? null,
        crm_status_color: meta?.color ?? null,
        contact_name: contact?.name ?? null,
        contact_role: contact?.role ?? null,
        contact_phone: contact?.phone ?? null,
        contact_email: contact?.email ?? null,
        contact_source_url: contact?.source_url ?? null,
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
