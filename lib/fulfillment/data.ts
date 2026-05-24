// Defensive Read-Helper fuer Fulfillment. Geht mit fehlenden Migrationen (071-074) um.

import { createServiceClient } from "@/lib/supabase/server";
import type { CustomerContact, Project, ProjectNote, ClickupTaskCached, LifecycleStage } from "./types";
import type { Lead } from "@/lib/types";

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  return /relation.*does not exist|column.*does not exist/i.test(error.message ?? "");
}

export async function listCustomers(): Promise<Lead[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("leads")
    .select("*")
    .eq("lifecycle_stage", "customer")
    .order("became_customer_at", { ascending: false, nullsFirst: false });
  if (error) {
    if (!isMissingTable(error)) console.error("[listCustomers]", error);
    return [];
  }
  return (data ?? []) as Lead[];
}

export async function loadCustomer(id: string): Promise<Lead | null> {
  const db = createServiceClient();
  const { data, error } = await db.from("leads").select("*").eq("id", id).maybeSingle<Lead>();
  if (error) {
    console.error("[loadCustomer]", error);
    return null;
  }
  return data;
}

export async function loadContacts(leadId: string): Promise<CustomerContact[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("customer_contacts")
    .select("*")
    .eq("lead_id", leadId)
    .order("is_primary", { ascending: false })
    .order("name", { ascending: true });
  if (error) {
    if (!isMissingTable(error)) console.error("[loadContacts]", error);
    return [];
  }
  return (data ?? []) as CustomerContact[];
}

export async function loadProjectsForLead(leadId: string): Promise<Project[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("projects")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error) {
    if (!isMissingTable(error)) console.error("[loadProjectsForLead]", error);
    return [];
  }
  return (data ?? []) as Project[];
}

export async function listAllProjects(filter?: { status?: string; vertical?: string }): Promise<Project[]> {
  const db = createServiceClient();
  let q = db.from("projects").select("*").order("updated_at", { ascending: false });
  if (filter?.status) q = q.eq("status", filter.status);
  if (filter?.vertical) q = q.eq("vertical", filter.vertical);
  const { data, error } = await q;
  if (error) {
    if (!isMissingTable(error)) console.error("[listAllProjects]", error);
    return [];
  }
  return (data ?? []) as Project[];
}

export async function loadProject(id: string): Promise<Project | null> {
  const db = createServiceClient();
  const { data, error } = await db.from("projects").select("*").eq("id", id).maybeSingle<Project>();
  if (error) {
    console.error("[loadProject]", error);
    return null;
  }
  return data;
}

export async function loadProjectNotes(projectId: string): Promise<ProjectNote[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("project_notes")
    .select("id, project_id, content, created_by, created_at, updated_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) {
    if (!isMissingTable(error)) console.error("[loadProjectNotes]", error);
    return [];
  }
  const notes = (data ?? []) as ProjectNote[];
  const authorIds = Array.from(new Set(notes.map((n) => n.created_by).filter((x): x is string => !!x)));
  if (authorIds.length === 0) return notes;
  const { data: profiles } = await db.from("profiles").select("id, name").in("id", authorIds);
  const nameById = new Map((profiles ?? []).map((p) => [p.id as string, (p.name as string | null) ?? null]));
  return notes.map((n) => ({ ...n, author_name: n.created_by ? nameById.get(n.created_by) ?? null : null }));
}

export async function loadCachedTasks(projectId: string, includeClosed = false): Promise<ClickupTaskCached[]> {
  const db = createServiceClient();
  let q = db
    .from("clickup_tasks_cache")
    .select("*")
    .eq("project_id", projectId)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (!includeClosed) q = q.eq("closed", false);
  const { data, error } = await q;
  if (error) {
    if (!isMissingTable(error)) console.error("[loadCachedTasks]", error);
    return [];
  }
  return (data ?? []) as ClickupTaskCached[];
}

export async function loadAllOpenTasks(): Promise<Array<ClickupTaskCached & { project_name?: string; customer_name?: string }>> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("clickup_tasks_cache")
    .select("*, projects!inner(name, lead_id, leads:lead_id(company_name))")
    .eq("closed", false)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) {
    if (!isMissingTable(error)) console.error("[loadAllOpenTasks]", error);
    return [];
  }
  return ((data ?? []) as unknown as Array<ClickupTaskCached & { projects?: { name: string; leads?: { company_name: string } } }>).map((r) => ({
    ...r,
    project_name: r.projects?.name,
    customer_name: r.projects?.leads?.company_name,
  }));
}

export type { Lead, LifecycleStage };
