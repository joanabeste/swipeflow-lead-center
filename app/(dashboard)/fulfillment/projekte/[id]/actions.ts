"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import { closeTask, createTask, deleteTask, syncListIntoCache } from "@/lib/clickup/tasks";
import { ClickupError } from "@/lib/clickup/client";
import { logAudit } from "@/lib/audit-log";
import {
  createProjectNoteAttachmentUploadTickets,
  deleteAttachmentsForProjectNote,
  deleteProjectNoteAttachment,
  registerProjectNoteAttachment,
  type NoteAttachmentUploadTicket,
  type UploadedAttachmentRef,
} from "@/lib/project-notes/attachments";
import { createNotification, resolveMentions } from "@/lib/notifications";

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

export async function deleteClickupTask(clickupTaskId: string): Promise<Result> {
  const u = await uid();
  if (!u) return { error: "Nicht angemeldet." };
  const db = createServiceClient();
  const { data: cached } = await db
    .from("clickup_tasks_cache")
    .select("project_id")
    .eq("clickup_task_id", clickupTaskId)
    .maybeSingle();
  try {
    await deleteTask(clickupTaskId);
  } catch (e) {
    // 404 = bereits in ClickUp geloescht — Cache trotzdem aufraeumen.
    if (!(e instanceof ClickupError && e.status === 404)) {
      return { error: translateError(e) };
    }
  }
  await db.from("clickup_tasks_cache").delete().eq("clickup_task_id", clickupTaskId);
  if (cached?.project_id) revalidatePath(`/fulfillment/projekte/${cached.project_id}`);
  revalidatePath("/fulfillment/tasks");
  await logAudit({ userId: u, action: "clickup.task.delete", entityType: "clickup_task", entityId: clickupTaskId });
  return { success: true };
}

// ─── Projekt-Notizen ─────────────────────────────────────────────

async function notifyMentions(content: string, projectId: string, noteId: string, actorId: string) {
  const { ids } = await resolveMentions(content);
  if (ids.length === 0) return;
  const db = createServiceClient();
  const { data: project } = await db.from("projects").select("name").eq("id", projectId).maybeSingle();
  const { data: actor } = await db.from("profiles").select("name, email").eq("id", actorId).maybeSingle();
  const actorName = (actor?.name as string | null) || (actor?.email as string | null) || "Jemand";
  const projectName = (project?.name as string | null) || "ein Projekt";
  await Promise.all(
    ids.map((uid) =>
      createNotification({
        userId: uid,
        type: "project_note_mention",
        title: `${actorName} hat dich in einer Projekt-Notiz erwaehnt`,
        body: `${projectName}: ${content.slice(0, 200)}${content.length > 200 ? "…" : ""}`,
        entityType: "project_note",
        entityId: noteId,
        link: `/fulfillment/projekte/${projectId}`,
        actorId,
      }),
    ),
  );
}

/** Wird vom Client VOR dem File-Upload aufgerufen — liefert signed Upload-URLs. */
export async function createProjectNoteUploads(
  projectId: string,
  files: { clientId: string; fileName: string; mimeType: string; sizeBytes: number }[],
): Promise<
  | { tickets: NoteAttachmentUploadTicket[]; errors: { clientId: string; error: string }[] }
  | { error: string }
> {
  const u = await uid();
  if (!u) return { error: "Nicht angemeldet." };
  if (files.length === 0) return { tickets: [], errors: [] };
  return createProjectNoteAttachmentUploadTickets({ projectId, files });
}

export async function addProjectNote(
  projectId: string,
  content: string,
  attachments: UploadedAttachmentRef[] = [],
): Promise<Result> {
  const u = await uid();
  if (!u) return { error: "Nicht angemeldet." };
  const trimmed = content.trim();
  if (!trimmed && attachments.length === 0) {
    return { error: "Notiz darf nicht leer sein." };
  }

  const db = createServiceClient();
  const { data, error } = await db
    .from("project_notes")
    .insert({ project_id: projectId, content: trimmed || "(nur Anhang)", created_by: u })
    .select("id")
    .single();
  if (error) {
    if (/relation.*does not exist/i.test(error.message)) {
      return { error: "Tabelle project_notes fehlt — Migration 081 muss in Supabase ausgefuehrt werden." };
    }
    return { error: `DB-Fehler: ${error.message}` };
  }

  const warnings: string[] = [];
  for (const ref of attachments) {
    const res = await registerProjectNoteAttachment({ projectId, noteId: data.id as string, userId: u, ref });
    if ("error" in res) warnings.push(`${ref.fileName}: ${res.error}`);
  }

  await logAudit({ userId: u, action: "project.note_added", entityType: "project", entityId: projectId, details: { note_id: data.id, attachment_count: attachments.length } });
  await notifyMentions(trimmed, projectId, data.id as string, u);

  revalidatePath(`/fulfillment/projekte/${projectId}`);
  if (warnings.length > 0) return { success: true, data: { warning: warnings.join("; ") } as never };
  return { success: true };
}

export async function updateProjectNote(
  noteId: string,
  projectId: string,
  content: string,
  addAttachments: UploadedAttachmentRef[] = [],
  removeAttachmentIds: string[] = [],
): Promise<Result> {
  const u = await uid();
  if (!u) return { error: "Nicht angemeldet." };
  const trimmed = content.trim();
  if (!trimmed && addAttachments.length === 0) {
    const db0 = createServiceClient();
    const { count } = await db0
      .from("project_note_attachments")
      .select("id", { count: "exact", head: true })
      .eq("note_id", noteId);
    const remaining = (count ?? 0) - removeAttachmentIds.length;
    if (remaining <= 0) return { error: "Notiz darf nicht leer sein." };
  }

  const db = createServiceClient();
  if (trimmed) {
    const { error } = await db
      .from("project_notes")
      .update({ content: trimmed, updated_at: new Date().toISOString() })
      .eq("id", noteId);
    if (error) return { error: `DB-Fehler: ${error.message}` };
  } else {
    await db.from("project_notes").update({ updated_at: new Date().toISOString() }).eq("id", noteId);
  }

  const warnings: string[] = [];
  for (const id of removeAttachmentIds) {
    const res = await deleteProjectNoteAttachment(id);
    if (res.error) warnings.push(`Loeschen fehlgeschlagen (${id}): ${res.error}`);
  }
  for (const ref of addAttachments) {
    const res = await registerProjectNoteAttachment({ projectId, noteId, userId: u, ref });
    if ("error" in res) warnings.push(`${ref.fileName}: ${res.error}`);
  }

  await logAudit({
    userId: u, action: "project.note_updated", entityType: "project", entityId: projectId,
    details: { note_id: noteId, attachments_added: addAttachments.length, attachments_removed: removeAttachmentIds.length },
  });
  // Mentions auch bei Edit neu auswerten — neue Mentions bekommen Notification.
  if (trimmed) await notifyMentions(trimmed, projectId, noteId, u);

  revalidatePath(`/fulfillment/projekte/${projectId}`);
  if (warnings.length > 0) return { success: true, data: { warning: warnings.join("; ") } as never };
  return { success: true };
}

export async function deleteProjectNote(noteId: string, projectId: string): Promise<Result> {
  const u = await uid();
  if (!u) return { error: "Nicht angemeldet." };
  const db = createServiceClient();

  await deleteAttachmentsForProjectNote(noteId);

  const { error } = await db.from("project_notes").delete().eq("id", noteId);
  if (error) return { error: `DB-Fehler: ${error.message}` };
  await logAudit({ userId: u, action: "project.note_deleted", entityType: "project", entityId: projectId, details: { note_id: noteId } });
  revalidatePath(`/fulfillment/projekte/${projectId}`);
  return { success: true };
}
