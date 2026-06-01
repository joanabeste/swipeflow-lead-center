"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import type { LifecycleStage, ProjectStatus } from "@/lib/fulfillment/types";

type Result<T = unknown> = { success: true; data?: T } | { error: string };

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function dbError(prefix: string, error: { code?: string; message?: string }): string {
  console.error(`[${prefix}]`, error);
  if (error.code === "42P01" || /relation.*does not exist|column.*does not exist/i.test(error.message ?? "")) {
    return "Fulfillment-Modul nicht migriert — Migrationen 071–074 muessen in Supabase ausgefuehrt werden.";
  }
  return `DB-Fehler: ${error.message}`;
}

// ─── Lifecycle / Lead → Kunde ───────────────────────────────────

export async function setLifecycleStage(leadId: string, stage: LifecycleStage): Promise<Result> {
  const uid = await currentUserId();
  if (!uid) return { error: "Nicht angemeldet." };
  const db = createServiceClient();
  const patch: Record<string, unknown> = { lifecycle_stage: stage };
  if (stage === "customer") patch.became_customer_at = new Date().toISOString();
  const { error } = await db.from("leads").update(patch).eq("id", leadId);
  if (error) return { error: dbError("setLifecycleStage", error) };
  await logAudit({ userId: uid, action: `lead.lifecycle.${stage}`, entityType: "lead", entityId: leadId });
  revalidatePath("/crm");
  revalidatePath(`/crm/${leadId}`);
  revalidatePath("/fulfillment/kunden");
  revalidatePath(`/fulfillment/kunden/${leadId}`);
  return { success: true };
}

// ─── Customer Contacts ──────────────────────────────────────────

/**
 * Spiegelt email/phone des primaeren Kontakts auf den Lead-Datensatz.
 * Fallback: erster Kontakt mit Email/Phone, sonst null.
 * Wird nach jedem Contact-Create/Update/Delete aufgerufen.
 */
async function syncLeadFromPrimaryContact(leadId: string): Promise<void> {
  const db = createServiceClient();
  const { data: contacts } = await db
    .from("customer_contacts")
    .select("email, phone, is_primary, created_at")
    .eq("lead_id", leadId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  const list = (contacts ?? []) as Array<{ email: string | null; phone: string | null; is_primary: boolean }>;
  const primary = list.find((c) => c.is_primary);
  const emailSource = primary?.email ? primary : list.find((c) => c.email);
  const phoneSource = primary?.phone ? primary : list.find((c) => c.phone);
  await db
    .from("leads")
    .update({
      email: emailSource?.email ?? null,
      phone: phoneSource?.phone ?? null,
    })
    .eq("id", leadId);
}

export async function createContact(input: {
  lead_id: string;
  first_name: string;
  last_name?: string;
  salutation?: "du" | "sie";
  role?: string;
  email?: string;
  phone?: string;
  is_primary?: boolean;
  notes?: string;
}): Promise<Result<{ id: string }>> {
  const uid = await currentUserId();
  if (!uid) return { error: "Nicht angemeldet." };
  if (!input.first_name?.trim()) return { error: "Vorname fehlt." };
  const db = createServiceClient();

  // Wenn neu als primary markiert, zuerst alle anderen zuruecksetzen.
  if (input.is_primary) {
    await db.from("customer_contacts").update({ is_primary: false }).eq("lead_id", input.lead_id);
  }

  const { data, error } = await db
    .from("customer_contacts")
    .insert({
      lead_id: input.lead_id,
      first_name: input.first_name.trim(),
      last_name: input.last_name?.trim() || null,
      salutation: input.salutation ?? "sie",
      role: input.role?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      is_primary: !!input.is_primary,
      notes: input.notes?.trim() || null,
      created_by: uid,
    })
    .select("id")
    .single();
  if (error) return { error: dbError("createContact", error) };
  await syncLeadFromPrimaryContact(input.lead_id);
  await logAudit({ userId: uid, action: "customer.contact.create", entityType: "customer_contact", entityId: data.id });
  revalidatePath(`/fulfillment/kunden/${input.lead_id}`);
  return { success: true, data: { id: data.id } };
}

export async function updateContact(id: string, patch: Partial<{
  first_name: string; last_name: string | null; salutation: "du" | "sie";
  role: string | null; email: string | null; phone: string | null; is_primary: boolean; notes: string | null;
}>): Promise<Result> {
  const uid = await currentUserId();
  if (!uid) return { error: "Nicht angemeldet." };
  const db = createServiceClient();

  if (patch.is_primary) {
    const { data: existing } = await db.from("customer_contacts").select("lead_id").eq("id", id).single();
    if (existing?.lead_id) {
      await db.from("customer_contacts").update({ is_primary: false }).eq("lead_id", existing.lead_id);
    }
  }

  const update: Record<string, unknown> = {};
  for (const k of ["first_name", "last_name", "salutation", "role", "email", "phone", "is_primary", "notes"] as const) {
    if (patch[k] !== undefined) update[k] = patch[k];
  }
  const { error } = await db.from("customer_contacts").update(update).eq("id", id);
  if (error) return { error: dbError("updateContact", error) };
  const { data: row } = await db.from("customer_contacts").select("lead_id").eq("id", id).maybeSingle();
  if (row?.lead_id) await syncLeadFromPrimaryContact(row.lead_id as string);
  await logAudit({ userId: uid, action: "customer.contact.update", entityType: "customer_contact", entityId: id });
  if (row?.lead_id) revalidatePath(`/fulfillment/kunden/${row.lead_id}`);
  else revalidatePath("/fulfillment");
  return { success: true };
}

export async function deleteContact(id: string): Promise<Result> {
  const uid = await currentUserId();
  if (!uid) return { error: "Nicht angemeldet." };
  const db = createServiceClient();
  const { data: existing } = await db.from("customer_contacts").select("lead_id").eq("id", id).single();
  const { error } = await db.from("customer_contacts").delete().eq("id", id);
  if (error) return { error: dbError("deleteContact", error) };
  if (existing?.lead_id) await syncLeadFromPrimaryContact(existing.lead_id as string);
  await logAudit({ userId: uid, action: "customer.contact.delete", entityType: "customer_contact", entityId: id });
  if (existing?.lead_id) revalidatePath(`/fulfillment/kunden/${existing.lead_id}`);
  return { success: true };
}

// ─── Projects ──────────────────────────────────────────────────

export async function createProject(input: {
  lead_id: string;
  name: string;
  status?: ProjectStatus;
  vertical?: "webdesign" | "recruiting" | "sonstiges";
  project_type_id?: string | null;
  started_at?: string;
  notes?: string;
}): Promise<Result<{ id: string }>> {
  const uid = await currentUserId();
  if (!uid) return { error: "Nicht angemeldet." };
  if (!input.name?.trim()) return { error: "Projekt-Name fehlt." };
  const db = createServiceClient();
  const { data, error } = await db
    .from("projects")
    .insert({
      lead_id: input.lead_id,
      name: input.name.trim(),
      status: input.status ?? "onboarding",
      vertical: input.vertical ?? null,
      project_type_id: input.project_type_id ?? null,
      started_at: input.started_at || null,
      notes: input.notes?.trim() || null,
      created_by: uid,
    })
    .select("id")
    .single();
  if (error) return { error: dbError("createProject", error) };
  await logAudit({ userId: uid, action: "project.create", entityType: "project", entityId: data.id, details: { lead_id: input.lead_id } });
  revalidatePath(`/fulfillment/kunden/${input.lead_id}`);
  revalidatePath("/fulfillment/projekte");
  return { success: true, data: { id: data.id } };
}

export async function updateProject(id: string, patch: Partial<{
  name: string;
  status: ProjectStatus;
  vertical: "webdesign" | "recruiting" | "sonstiges" | null;
  project_type_id: string | null;
  clickup_list_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
}>): Promise<Result> {
  const uid = await currentUserId();
  if (!uid) return { error: "Nicht angemeldet." };
  const db = createServiceClient();
  const update: Record<string, unknown> = {};
  for (const k of ["name", "status", "vertical", "project_type_id", "clickup_list_id", "started_at", "completed_at", "notes"] as const) {
    if (patch[k] !== undefined) update[k] = patch[k];
  }
  if (patch.status === "completed" && !patch.completed_at) {
    update.completed_at = new Date().toISOString().slice(0, 10);
  }
  const { error } = await db.from("projects").update(update).eq("id", id);
  if (error) return { error: dbError("updateProject", error) };
  await logAudit({ userId: uid, action: "project.update", entityType: "project", entityId: id, details: update });
  revalidatePath("/fulfillment");
  revalidatePath("/fulfillment/projekte");
  revalidatePath(`/fulfillment/projekte/${id}`);
  return { success: true };
}

export async function deleteProject(id: string): Promise<Result> {
  const uid = await currentUserId();
  if (!uid) return { error: "Nicht angemeldet." };
  const db = createServiceClient();
  const { data: existing } = await db.from("projects").select("lead_id").eq("id", id).single();
  const { error } = await db.from("projects").delete().eq("id", id);
  if (error) return { error: dbError("deleteProject", error) };
  await logAudit({ userId: uid, action: "project.delete", entityType: "project", entityId: id });
  if (existing?.lead_id) revalidatePath(`/fulfillment/kunden/${existing.lead_id}`);
  revalidatePath("/fulfillment/projekte");
  return { success: true };
}
