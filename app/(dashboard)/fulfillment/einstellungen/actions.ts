"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto/secrets";
import { clickupFetch, invalidateClickupConfigCache, ClickupError } from "@/lib/clickup/client";
import { syncListIntoCache } from "@/lib/clickup/tasks";
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

  // Token gegen ClickUp testen.
  try {
    await clickupFetch("/team", { token: trimmed });
  } catch (e) {
    if (e instanceof ClickupError && e.status === 401) return { error: "Token ungueltig — pruefe in ClickUp unter Apps → API-Token." };
    return { error: e instanceof Error ? e.message : "Verbindungsfehler." };
  }

  // Verschluesseln — schlaegt fehl wenn CREDENTIALS_ENCRYPTION_KEY fehlt/falsch.
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
    workspace_id: workspaceId ?? null,
    workspace_name: workspaceName ?? null,
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
  await logAudit({ userId: u, action: "clickup.token.save" });
  revalidatePath("/fulfillment/einstellungen");
  return { success: true };
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
