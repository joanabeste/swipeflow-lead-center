import { clickupFetch } from "./client";
import { createServiceClient } from "@/lib/supabase/server";

export interface ClickupTask {
  id: string;
  name: string;
  status: { status: string; color: string };
  assignees: Array<{ id: number; username: string; email: string }>;
  due_date: string | null;
  url: string;
  date_closed: string | null;
  date_updated: string;
}

export interface ClickupList {
  id: string;
  name: string;
  folder?: { name: string };
  space?: { name: string };
}

export interface ClickupSpace { id: string; name: string }

export interface ClickupMember { user: { id: number; username: string; email: string } }

export async function listSpaces(teamId: string) {
  return clickupFetch<{ spaces: ClickupSpace[] }>(`/team/${teamId}/space?archived=false`);
}

export async function listFolders(spaceId: string) {
  return clickupFetch<{ folders: Array<{ id: string; name: string; lists: ClickupList[] }> }>(`/space/${spaceId}/folder?archived=false`);
}

export async function listFolderlessLists(spaceId: string) {
  return clickupFetch<{ lists: ClickupList[] }>(`/space/${spaceId}/list?archived=false`);
}

export async function listTeamMembers(teamId: string) {
  return clickupFetch<{ members: ClickupMember[] }>(`/team/${teamId}`).then((r) => {
    const team = (r as unknown as { team?: { members: ClickupMember[] } }).team;
    return { members: team?.members ?? [] };
  });
}

export async function listTeams() {
  return clickupFetch<{ teams: Array<{ id: string; name: string }> }>(`/team`);
}

export async function listTasksInList(listId: string, includeClosed = false): Promise<ClickupTask[]> {
  const params = new URLSearchParams({ subtasks: "false", include_closed: String(includeClosed) });
  const data = await clickupFetch<{ tasks: ClickupTask[] }>(`/list/${listId}/task?${params.toString()}`);
  return data.tasks ?? [];
}

export async function createTask(listId: string, input: { name: string; description?: string; assignees?: number[]; due_date?: number }) {
  return clickupFetch<ClickupTask>(`/list/${listId}/task`, {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      description: input.description ?? "",
      assignees: input.assignees ?? [],
      due_date: input.due_date,
      notify_all: true,
    }),
  });
}

export async function closeTask(taskId: string) {
  // ClickUp Standard-Status zum Schliessen ist "complete" / "closed" — wir nutzen "closed".
  return clickupFetch<ClickupTask>(`/task/${taskId}`, {
    method: "PUT",
    body: JSON.stringify({ status: "closed" }),
  });
}

export async function deleteTask(taskId: string) {
  return clickupFetch<unknown>(`/task/${taskId}`, { method: "DELETE" });
}

export async function updateTaskStatus(taskId: string, status: string) {
  return clickupFetch<ClickupTask>(`/task/${taskId}`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}

// ─── Sync in unseren Cache ──────────────────────────────────────

export async function syncListIntoCache(projectId: string, listId: string) {
  const tasks = await listTasksInList(listId, true);
  const db = createServiceClient();
  if (tasks.length === 0) {
    // Cache fuer dieses Projekt leeren, falls Tasks geloescht.
    await db.from("clickup_tasks_cache").delete().eq("project_id", projectId);
    return { count: 0 };
  }
  const rows = tasks.map((t) => ({
    clickup_task_id: t.id,
    project_id: projectId,
    name: t.name,
    status: t.status?.status ?? null,
    status_color: t.status?.color ?? null,
    assignees: t.assignees as unknown as Record<string, unknown>[],
    due_date: t.due_date ? new Date(Number(t.due_date)).toISOString() : null,
    url: t.url,
    closed: !!t.date_closed,
    last_synced_at: new Date().toISOString(),
    raw: t as unknown as Record<string, unknown>,
  }));
  const { error } = await db.from("clickup_tasks_cache").upsert(rows, { onConflict: "clickup_task_id" });
  if (error) throw new Error(error.message);
  // Tasks loeschen, die in ClickUp nicht mehr existieren.
  const ids = rows.map((r) => r.clickup_task_id);
  await db.from("clickup_tasks_cache").delete().eq("project_id", projectId).not("clickup_task_id", "in", `(${ids.map((i) => `"${i}"`).join(",")})`);
  return { count: rows.length };
}
