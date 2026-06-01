// Defensive Read-Helper fuer Fulfillment. Geht mit fehlenden Migrationen (071-074) um.

import { createServiceClient } from "@/lib/supabase/server";
import type { CustomerContact, Project, ProjectWithType, ProjectType, ProjectNote, ClickupTaskCached, LifecycleStage } from "./types";
import type { Lead } from "@/lib/types";

/** Projekt-Select inkl. aufgelöstem Typ (PostgREST-Embed). */
const PROJECT_WITH_TYPE = "*, type:project_types(*)";

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

export type CustomerWithActive = Lead & {
  active_project: { id: string; name: string; status: string } | null;
};

export async function listCustomersWithActiveProject(): Promise<CustomerWithActive[]> {
  const customers = await listCustomers();
  if (customers.length === 0) return [];
  const ids = customers.map((c) => c.id);
  const db = createServiceClient();
  const { data, error } = await db
    .from("projects")
    .select("id, name, status, lead_id, updated_at")
    .in("lead_id", ids)
    .neq("status", "completed")
    .order("updated_at", { ascending: false });
  if (error && !isMissingTable(error)) console.error("[listCustomersWithActiveProject]", error);
  const byLead = new Map<string, { id: string; name: string; status: string }>();
  for (const p of (data ?? []) as Array<{ id: string; name: string; status: string; lead_id: string }>) {
    if (!byLead.has(p.lead_id)) byLead.set(p.lead_id, { id: p.id, name: p.name, status: p.status });
  }
  return customers.map((c) => ({ ...c, active_project: byLead.get(c.id) ?? null }));
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

function withNullType(rows: Project[]): ProjectWithType[] {
  return rows.map((p) => ({ ...p, type: null }));
}

export async function loadProjectsForLead(leadId: string): Promise<ProjectWithType[]> {
  const db = createServiceClient();
  const embed = await db
    .from("projects")
    .select(PROJECT_WITH_TYPE)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (!embed.error) return (embed.data ?? []) as unknown as ProjectWithType[];
  // Fallback: project_types evtl. noch nicht migriert → ohne Typ laden.
  const plain = await db.from("projects").select("*").eq("lead_id", leadId).order("created_at", { ascending: false });
  if (plain.error) {
    if (!isMissingTable(plain.error)) console.error("[loadProjectsForLead]", plain.error);
    return [];
  }
  return withNullType((plain.data ?? []) as Project[]);
}

export async function listAllProjects(filter?: { status?: string; vertical?: string }): Promise<ProjectWithType[]> {
  const db = createServiceClient();
  const build = (sel: string) => {
    let q = db.from("projects").select(sel).order("updated_at", { ascending: false });
    if (filter?.status) q = q.eq("status", filter.status);
    if (filter?.vertical) q = q.eq("vertical", filter.vertical);
    return q;
  };
  const embed = await build(PROJECT_WITH_TYPE);
  if (!embed.error) return (embed.data ?? []) as unknown as ProjectWithType[];
  const plain = await build("*");
  if (plain.error) {
    if (!isMissingTable(plain.error)) console.error("[listAllProjects]", plain.error);
    return [];
  }
  return withNullType((plain.data ?? []) as unknown as Project[]);
}

export async function loadProject(id: string): Promise<ProjectWithType | null> {
  const db = createServiceClient();
  const embed = await db.from("projects").select(PROJECT_WITH_TYPE).eq("id", id).maybeSingle();
  if (!embed.error) return (embed.data ?? null) as unknown as ProjectWithType | null;
  const plain = await db.from("projects").select("*").eq("id", id).maybeSingle<Project>();
  if (plain.error) {
    if (!isMissingTable(plain.error)) console.error("[loadProject]", plain.error);
    return null;
  }
  return plain.data ? { ...plain.data, type: null } : null;
}

export async function listProjectTypes(opts?: { activeOnly?: boolean }): Promise<ProjectType[]> {
  const db = createServiceClient();
  let q = db.from("project_types").select("*").order("display_order", { ascending: true });
  if (opts?.activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) {
    if (!isMissingTable(error)) console.error("[listProjectTypes]", error);
    return [];
  }
  return (data ?? []) as ProjectType[];
}

export async function loadProjectType(id: string): Promise<ProjectType | null> {
  const db = createServiceClient();
  const { data, error } = await db.from("project_types").select("*").eq("id", id).maybeSingle<ProjectType>();
  if (error) {
    if (!isMissingTable(error)) console.error("[loadProjectType]", error);
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
  if (notes.length === 0) return notes;

  const authorIds = Array.from(new Set(notes.map((n) => n.created_by).filter((x): x is string => !!x)));
  const { getProjectNoteAttachmentsForNotes } = await import("@/lib/project-notes/attachments");
  const [profilesRes, attachmentsMap] = await Promise.all([
    authorIds.length > 0
      ? db.from("profiles").select("id, name").in("id", authorIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string | null }> }),
    getProjectNoteAttachmentsForNotes(notes.map((n) => n.id)),
  ]);
  const nameById = new Map((profilesRes.data ?? []).map((p) => [p.id as string, (p.name as string | null) ?? null]));

  return notes.map((n) => ({
    ...n,
    author_name: n.created_by ? nameById.get(n.created_by) ?? null : null,
    attachments: attachmentsMap.get(n.id) ?? [],
  }));
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
  return loadAllTasks({ onlyOpen: true });
}

export async function loadAllTasks(opts?: { onlyOpen?: boolean }): Promise<Array<ClickupTaskCached & { project_name?: string; customer_name?: string }>> {
  const db = createServiceClient();
  let query = db
    .from("clickup_tasks_cache")
    .select("*, projects!inner(name, lead_id, leads:lead_id(company_name))")
    .order("due_date", { ascending: true, nullsFirst: false });
  if (opts?.onlyOpen) query = query.eq("closed", false);
  const { data, error } = await query;
  if (error) {
    if (!isMissingTable(error)) console.error("[loadAllTasks]", error);
    return [];
  }
  return ((data ?? []) as unknown as Array<ClickupTaskCached & { projects?: { name: string; leads?: { company_name: string } } }>).map((r) => ({
    ...r,
    project_name: r.projects?.name,
    customer_name: r.projects?.leads?.company_name,
  }));
}

export type { Lead, LifecycleStage };
