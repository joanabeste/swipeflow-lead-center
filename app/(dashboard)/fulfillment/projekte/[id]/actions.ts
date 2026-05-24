"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import { closeTask, createTask, syncListIntoCache } from "@/lib/clickup/tasks";
import { ClickupError } from "@/lib/clickup/client";
import { logAudit } from "@/lib/audit-log";

type Result<T = unknown> = { success: true; data?: T } | { error: string };

async function uid(): Promise<string | null> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  return user?.id ?? null;
}

function translateError(e: unknown): string {
  if (e instanceof ClickupError) {
    if (e.status === 401) return "ClickUp-Token ungueltig oder abgelaufen.";
    if (e.status === 404) return "ClickUp-Ressource nicht gefunden (List/Task geloescht?).";
    if (e.status === 429) return "ClickUp Rate-Limit erreicht — kurz warten.";
    return `ClickUp ${e.status}: ${e.body.slice(0, 200)}`;
  }
  return e instanceof Error ? e.message : "Unbekannter Fehler.";
}

async function loadListId(projectId: string): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db.from("projects").select("clickup_list_id").eq("id", projectId).single();
  return (data?.clickup_list_id as string | undefined) ?? null;
}

export async function syncClickupTasks(projectId: string): Promise<Result<{ count: number }>> {
  const u = await uid();
  if (!u) return { error: "Nicht angemeldet." };
  const listId = await loadListId(projectId);
  if (!listId) return { error: "Projekt hat keine ClickUp-Liste verknuepft." };
  try {
    const res = await syncListIntoCache(projectId, listId);
    revalidatePath(`/fulfillment/projekte/${projectId}`);
    return { success: true, data: res };
  } catch (e) {
    return { error: translateError(e) };
  }
}

export async function createClickupTask(projectId: string, input: { name: string; description?: string }): Promise<Result> {
  const u = await uid();
  if (!u) return { error: "Nicht angemeldet." };
  const listId = await loadListId(projectId);
  if (!listId) return { error: "Projekt hat keine ClickUp-Liste verknuepft." };
  try {
    await createTask(listId, { name: input.name, description: input.description });
    await syncListIntoCache(projectId, listId);
    await logAudit({ userId: u, action: "clickup.task.create", entityType: "project", entityId: projectId });
    revalidatePath(`/fulfillment/projekte/${projectId}`);
    return { success: true };
  } catch (e) {
    return { error: translateError(e) };
  }
}

export async function closeClickupTask(clickupTaskId: string): Promise<Result> {
  const u = await uid();
  if (!u) return { error: "Nicht angemeldet." };
  const db = createServiceClient();
  const { data: cached } = await db
    .from("clickup_tasks_cache")
    .select("project_id")
    .eq("clickup_task_id", clickupTaskId)
    .maybeSingle();
  try {
    await closeTask(clickupTaskId);
    if (cached?.project_id) {
      const listId = await loadListId(cached.project_id as string);
      if (listId) await syncListIntoCache(cached.project_id as string, listId);
      revalidatePath(`/fulfillment/projekte/${cached.project_id}`);
    }
    await logAudit({ userId: u, action: "clickup.task.close", entityType: "clickup_task", entityId: clickupTaskId });
    return { success: true };
  } catch (e) {
    return { error: translateError(e) };
  }
}

// ─── Projekt-Notizen ─────────────────────────────────────────────

export async function addProjectNote(projectId: string, content: string): Promise<Result> {
  const u = await uid();
  if (!u) return { error: "Nicht angemeldet." };
  const trimmed = content.trim();
  if (!trimmed) return { error: "Notiz darf nicht leer sein." };

  const db = createServiceClient();
  const { data, error } = await db
    .from("project_notes")
    .insert({ project_id: projectId, content: trimmed, created_by: u })
    .select("id")
    .single();
  if (error) {
    if (/relation.*does not exist/i.test(error.message)) {
      return { error: "Tabelle project_notes fehlt — Migration 080 muss in Supabase ausgefuehrt werden." };
    }
    return { error: `DB-Fehler: ${error.message}` };
  }
  await logAudit({ userId: u, action: "project.note_added", entityType: "project", entityId: projectId, details: { note_id: data.id } });
  revalidatePath(`/fulfillment/projekte/${projectId}`);
  return { success: true };
}

export async function updateProjectNote(noteId: string, projectId: string, content: string): Promise<Result> {
  const u = await uid();
  if (!u) return { error: "Nicht angemeldet." };
  const trimmed = content.trim();
  if (!trimmed) return { error: "Notiz darf nicht leer sein." };

  const db = createServiceClient();
  const { error } = await db
    .from("project_notes")
    .update({ content: trimmed, updated_at: new Date().toISOString() })
    .eq("id", noteId);
  if (error) return { error: `DB-Fehler: ${error.message}` };
  await logAudit({ userId: u, action: "project.note_updated", entityType: "project", entityId: projectId, details: { note_id: noteId } });
  revalidatePath(`/fulfillment/projekte/${projectId}`);
  return { success: true };
}

export async function deleteProjectNote(noteId: string, projectId: string): Promise<Result> {
  const u = await uid();
  if (!u) return { error: "Nicht angemeldet." };
  const db = createServiceClient();
  const { error } = await db.from("project_notes").delete().eq("id", noteId);
  if (error) return { error: `DB-Fehler: ${error.message}` };
  await logAudit({ userId: u, action: "project.note_deleted", entityType: "project", entityId: projectId, details: { note_id: noteId } });
  revalidatePath(`/fulfillment/projekte/${projectId}`);
  return { success: true };
}
