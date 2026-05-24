"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto/secrets";
import { clickupFetch, invalidateClickupConfigCache, ClickupError } from "@/lib/clickup/client";
import { syncListIntoCache, listSpaces, listFolders, listFolderlessLists } from "@/lib/clickup/tasks";
import { logAudit } from "@/lib/audit-log";
import { checkAdmin } from "@/lib/auth";
import { createCustomer } from "../kunden/actions";
import { createProject } from "../actions";

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

// ─── ClickUp → Lead-Center Reverse-Sync ─────────────────────────────────

export interface ClickupSyncReport {
  spaceName: string;
  foldersScanned: number;
  customersCreated: number;
  customersReused: number;
  projectsCreated: number;
  projectsExisting: number;
  tasksSynced: number;
  skipped: Array<{ folder: string; reason: string }>;
  errors: Array<{ folder: string; error: string }>;
}

/**
 * Importiert/aktualisiert alle Folders aus einem ClickUp-Space als
 * (Kunde + Projekt + Task-Cache). Idempotent ueber projects.clickup_folder_id.
 *
 * Pro Folder:
 * - Bereits gesynct (folder-id matcht ein Projekt) → nur Task-Cache refresh
 * - Neu: Customer per company_name-Lookup wiederverwenden ODER anlegen,
 *   dann pro Liste im Folder ein Projekt anlegen + List-ID setzen + Tasks pullen
 */
export async function syncClickupFulfillmentSpace(
  spaceName = "Fulfillment",
): Promise<{ data: ClickupSyncReport } | { error: string }> {
  const u = await requireAdminId();
  if (typeof u !== "string") return u;

  const db = createServiceClient();

  // Workspace-ID besorgen (Self-Heal falls null — analog loadClickupLists).
  const { data: integration } = await db
    .from("app_integrations")
    .select("workspace_id")
    .eq("provider", "clickup")
    .maybeSingle();
  if (!integration) return { error: "ClickUp ist nicht verbunden." };
  let workspaceId = (integration.workspace_id as string | null) ?? null;
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

  // Space per case-insensitive Name finden.
  let spaceId: string;
  let resolvedSpaceName: string;
  try {
    const spaces = (await listSpaces(workspaceId)).spaces ?? [];
    const wanted = spaceName.trim().toLowerCase();
    const space = spaces.find((s) => s.name.trim().toLowerCase() === wanted);
    if (!space) {
      return { error: `Space "${spaceName}" nicht gefunden. Verfuegbar: ${spaces.map((s) => s.name).join(", ")}` };
    }
    spaceId = space.id;
    resolvedSpaceName = space.name;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Spaces konnten nicht geladen werden." };
  }

  const report: ClickupSyncReport = {
    spaceName: resolvedSpaceName,
    foldersScanned: 0,
    customersCreated: 0,
    customersReused: 0,
    projectsCreated: 0,
    projectsExisting: 0,
    tasksSynced: 0,
    skipped: [],
    errors: [],
  };

  let folders: Array<{ id: string; name: string; lists: Array<{ id: string; name: string }> }>;
  try {
    const res = await listFolders(spaceId);
    folders = res.folders ?? [];
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Folders konnten nicht geladen werden." };
  }

  for (const folder of folders) {
    report.foldersScanned++;
    try {
      // 1) Folder schon bekannt? → nur Tasks refreshen.
      const { data: existingProjects } = await db
        .from("projects")
        .select("id, clickup_list_id")
        .eq("clickup_folder_id", folder.id);
      if (existingProjects && existingProjects.length > 0) {
        report.projectsExisting += existingProjects.length;
        // Bei genau 1 Folder-Liste und 1 Projekt: clickup_list_id sicherheitshalber auffuellen,
        // falls es vorher fehlte. Bei mehrdeutigen Folders dies dem User ueberlassen.
        const lists = folder.lists ?? [];
        if (existingProjects.length === 1 && lists.length === 1 && !existingProjects[0].clickup_list_id) {
          await db.from("projects").update({ clickup_list_id: lists[0].id }).eq("id", existingProjects[0].id as string);
          (existingProjects[0] as { clickup_list_id: string | null }).clickup_list_id = lists[0].id;
        }
        for (const p of existingProjects) {
          const listId = p.clickup_list_id as string | null;
          if (listId) {
            try {
              const res = await syncListIntoCache(p.id as string, listId);
              report.tasksSynced += res.count;
            } catch (e) {
              report.errors.push({ folder: folder.name, error: e instanceof Error ? e.message : "Task-Sync fehlgeschlagen." });
            }
          }
        }
        continue;
      }

      // 2) Folder ohne Listen → skip.
      const lists = folder.lists ?? [];
      if (lists.length === 0) {
        report.skipped.push({ folder: folder.name, reason: "Keine Listen im Folder." });
        continue;
      }

      // 3) Customer-Lookup (case-insensitive auf company_name + lifecycle='customer').
      const folderName = folder.name.trim();
      const { data: existingCustomer } = await db
        .from("leads")
        .select("id")
        .ilike("company_name", folderName)
        .eq("lifecycle_stage", "customer")
        .limit(1)
        .maybeSingle();

      let leadId: string;
      if (existingCustomer) {
        leadId = existingCustomer.id as string;
        report.customersReused++;
      } else {
        const cr = await createCustomer({ company_name: folderName });
        if ("error" in cr) {
          report.errors.push({ folder: folder.name, error: cr.error });
          continue;
        }
        leadId = cr.id;
        report.customersCreated++;
      }

      // 4) Pro Liste: Projekt finden (per Name) oder anlegen, dann folder/list-ID setzen + Tasks pullen.
      for (const list of lists) {
        const projectName = lists.length === 1 ? folderName : list.name;

        // Existierendes Projekt mit gleichem Namen unter diesem Kunden suchen — verhindert Duplikate
        // und linkt bestehende manuelle Projekte mit ihrer ClickUp-Liste.
        const { data: existingByName } = await db
          .from("projects")
          .select("id, clickup_list_id")
          .eq("lead_id", leadId)
          .ilike("name", projectName)
          .limit(1)
          .maybeSingle();

        let projectId: string;
        if (existingByName) {
          projectId = existingByName.id as string;
          report.projectsExisting++;
        } else {
          const pr = await createProject({ lead_id: leadId, name: projectName });
          if ("error" in pr) {
            report.errors.push({ folder: folder.name, error: pr.error });
            continue;
          }
          projectId = pr.data!.id;
          report.projectsCreated++;
        }

        const { error: updErr } = await db
          .from("projects")
          .update({ clickup_folder_id: folder.id, clickup_list_id: list.id })
          .eq("id", projectId);
        if (updErr) {
          // 23505 = unique violation auf folder_id (gleicher Folder schon auf anderem Projekt).
          if (updErr.code === "23505") {
            // Nur loeschen, wenn wir das Projekt soeben angelegt haben — bestehende nicht anfassen.
            if (!existingByName) {
              await db.from("projects").delete().eq("id", projectId);
              report.projectsCreated--;
              report.projectsExisting++;
            }
            continue;
          }
          if (/column.*clickup_folder_id.*does not exist/i.test(updErr.message)) {
            return { error: "Spalte projects.clickup_folder_id fehlt — Migration 086 muss ausgefuehrt werden." };
          }
          report.errors.push({ folder: folder.name, error: `Folder-ID-Update: ${updErr.message}` });
          continue;
        }

        try {
          const sr = await syncListIntoCache(projectId, list.id);
          report.tasksSynced += sr.count;
        } catch (e) {
          report.errors.push({ folder: folder.name, error: e instanceof Error ? e.message : "Task-Sync fehlgeschlagen." });
        }
      }
    } catch (e) {
      report.errors.push({ folder: folder.name, error: e instanceof Error ? e.message : "Unbekannter Fehler." });
    }
  }

  await logAudit({
    userId: u,
    action: "clickup.fulfillment.reverse_sync",
    details: {
      space: resolvedSpaceName,
      scanned: report.foldersScanned,
      customers_created: report.customersCreated,
      customers_reused: report.customersReused,
      projects_created: report.projectsCreated,
      projects_existing: report.projectsExisting,
      tasks_synced: report.tasksSynced,
      skipped: report.skipped.length,
      errors: report.errors.length,
    },
  });

  revalidatePath("/fulfillment/einstellungen");
  revalidatePath("/fulfillment/kunden");
  revalidatePath("/fulfillment/projekte");
  return { data: report };
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
