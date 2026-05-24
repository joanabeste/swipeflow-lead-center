"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto/secrets";
import { clickupFetch, invalidateClickupConfigCache, ClickupError } from "@/lib/clickup/client";
import { syncListIntoCache, listSpaces, listFolders, listFolderlessLists } from "@/lib/clickup/tasks";
import { logAudit } from "@/lib/audit-log";
import { checkAdmin } from "@/lib/auth";

type Result<T = unknown> = { success: true; data?: T } | { error: string };

async function requireAdminId(): Promise<string | { error: string }> {
  const ctx = await checkAdmin();
  if (!ctx) return { error: "Nur Admins koennen die ClickUp-Integration verwalten." };
  return ctx.user.id;
}

export async function saveClickupToken(token: string, workspaceId?: string, workspaceName?: string): Promise<Result> {
  const u = await requireAdminId();
  if (typeof u !== "string") return u;
  const trimmed = token?.trim();
  if (!trimmed) return { error: "Token fehlt." };

  // Token gegen ClickUp testen + Teams holen, falls Workspace-ID nicht angegeben.
  let teams: Array<{ id: string; name: string }> = [];
  try {
    const res = await clickupFetch<{ teams: Array<{ id: string; name: string }> }>("/team", { token: trimmed });
    teams = res.teams ?? [];
  } catch (e) {
    if (e instanceof ClickupError && e.status === 401) return { error: "Token ungueltig — pruefe in ClickUp unter Apps → API-Token." };
    return { error: e instanceof Error ? e.message : "Verbindungsfehler." };
  }

  // Wenn keine explizite Workspace-Wahl: ersten Team automatisch nehmen.
  let finalWorkspaceId = workspaceId?.trim() || null;
  let finalWorkspaceName = workspaceName?.trim() || null;
  if (!finalWorkspaceId && teams.length > 0) {
    finalWorkspaceId = teams[0].id;
    finalWorkspaceName = teams[0].name;
  }

  let encrypted: string;
  try {
    encrypted = encryptSecret(trimmed);
  } catch (e) {
    console.error("[saveClickupToken] encryptSecret failed:", e);
    return { error: e instanceof Error ? `Konfigurations-Fehler: ${e.message}` : "Token-Verschluesselung fehlgeschlagen." };
  }

  const db = createServiceClient();
  const { error } = await db.from("app_integrations").upsert({
    provider: "clickup",
    config_encrypted: encrypted,
    workspace_id: finalWorkspaceId,
    workspace_name: finalWorkspaceName,
    configured_by: u,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    if (/relation.*does not exist/i.test(error.message)) {
      return { error: "Tabelle app_integrations fehlt — Migration 074 muss in Supabase ausgefuehrt werden." };
    }
    return { error: `DB-Fehler: ${error.message}` };
  }
  invalidateClickupConfigCache();
  await logAudit({ userId: u, action: "clickup.token.save", details: { workspace_id: finalWorkspaceId, teams_count: teams.length } });
  revalidatePath("/fulfillment/einstellungen");
  return { success: true };
}

export interface ClickupListChoice {
  id: string;
  name: string;
  spaceName: string;
  folderName: string | null;
}

/** Laedt alle ClickUp-Listen des verbundenen Workspaces als flache, sortierte Liste
 *  zum Dropdown-Befuellen. Liste = Space + (optional) Folder + Liste. */
export async function loadClickupLists(): Promise<{ lists: ClickupListChoice[] } | { error: string }> {
  const u = await requireAdminId();
  if (typeof u !== "string") return u;

  const db = createServiceClient();
  const { data: integration } = await db
    .from("app_integrations")
    .select("workspace_id, configured_at")
    .eq("provider", "clickup")
    .maybeSingle();
  if (!integration) return { error: "ClickUp ist nicht verbunden." };
  let workspaceId = (integration.workspace_id as string | null) ?? null;

  // Self-Heal: alte Integrationen ohne workspace_id automatisch befuellen.
  if (!workspaceId) {
    try {
      const res = await clickupFetch<{ teams: Array<{ id: string; name: string }> }>("/team");
      const first = res.teams?.[0];
      if (!first) return { error: "Token funktioniert, aber kein ClickUp-Workspace gefunden." };
      workspaceId = first.id;
      await db
        .from("app_integrations")
        .update({ workspace_id: first.id, workspace_name: first.name, updated_at: new Date().toISOString() })
        .eq("provider", "clickup");
      invalidateClickupConfigCache();
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Workspace-Lookup fehlgeschlagen." };
    }
  }

  try {
    const spaces = (await listSpaces(workspaceId)).spaces ?? [];
    const out: ClickupListChoice[] = [];
    for (const space of spaces) {
      const [foldersRes, looseRes] = await Promise.all([
        listFolders(space.id).catch(() => ({ folders: [] })),
        listFolderlessLists(space.id).catch(() => ({ lists: [] })),
      ]);
      for (const folder of foldersRes.folders ?? []) {
        for (const list of folder.lists ?? []) {
          out.push({ id: list.id, name: list.name, spaceName: space.name, folderName: folder.name });
        }
      }
      for (const list of looseRes.lists ?? []) {
        out.push({ id: list.id, name: list.name, spaceName: space.name, folderName: null });
      }
    }
    out.sort((a, b) =>
      a.spaceName.localeCompare(b.spaceName) ||
      (a.folderName ?? "").localeCompare(b.folderName ?? "") ||
      a.name.localeCompare(b.name),
    );
    return { lists: out };
  } catch (e) {
    console.error("[loadClickupLists]", e);
    return { error: e instanceof Error ? e.message : "ClickUp-Listen konnten nicht geladen werden." };
  }
}

export async function selectClickupWorkspace(workspaceId: string, workspaceName: string): Promise<Result> {
  const u = await requireAdminId();
  if (typeof u !== "string") return u;
  const db = createServiceClient();
  const { error } = await db
    .from("app_integrations")
    .update({ workspace_id: workspaceId, workspace_name: workspaceName, updated_at: new Date().toISOString() })
    .eq("provider", "clickup");
  if (error) return { error: error.message };
  invalidateClickupConfigCache();
  revalidatePath("/fulfillment/einstellungen");
  return { success: true };
}

export async function mapListToProject(projectId: string, listId: string | null): Promise<Result> {
  const u = await requireAdminId();
  if (typeof u !== "string") return u;
  const db = createServiceClient();
  const { error } = await db.from("projects").update({ clickup_list_id: listId || null }).eq("id", projectId);
  if (error) return { error: error.message };
  if (listId) {
    try { await syncListIntoCache(projectId, listId); } catch (e) { console.error("[mapListToProject sync]", e); }
  } else {
    await db.from("clickup_tasks_cache").delete().eq("project_id", projectId);
  }
  await logAudit({ userId: u, action: "clickup.list.map", entityType: "project", entityId: projectId, details: { list_id: listId } });
  revalidatePath(`/fulfillment/projekte/${projectId}`);
  revalidatePath("/fulfillment/einstellungen");
  return { success: true };
}

export async function disconnectClickup(): Promise<Result> {
  const u = await requireAdminId();
  if (typeof u !== "string") return u;
  const db = createServiceClient();
  await db.from("clickup_tasks_cache").delete().not("clickup_task_id", "is", null);
  await db.from("projects").update({ clickup_list_id: null }).not("clickup_list_id", "is", null);
  await db.from("app_integrations").delete().eq("provider", "clickup");
  invalidateClickupConfigCache();
  await logAudit({ userId: u, action: "clickup.disconnect" });
  revalidatePath("/fulfillment/einstellungen");
  return { success: true };
}
