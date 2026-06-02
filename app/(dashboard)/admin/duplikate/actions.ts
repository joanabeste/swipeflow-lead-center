"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit-log";
import {
  buildDuplicateClusters,
  pickSurvivor,
  type LeadForCluster,
} from "@/lib/leads/duplicate-clusters";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { insertMergeNote } from "@/lib/leads/merge-note";
import { revalidatePath } from "next/cache";

export interface ClusterView {
  survivor: LeadForCluster;
  losers: LeadForCluster[];
}

/** Laedt alle nicht-archivierten Leads inkl. Aktivitaets-Gewichtung und
 *  bildet Duplikat-Cluster mit gewaehltem Survivor. */
export async function findDuplicateClusters(): Promise<ClusterView[]> {
  await requireAdmin();
  const db = createServiceClient();

  // Archivierte CRM-Status (aussortierte Leads ausschliessen).
  const { data: archivedRows } = await db
    .from("custom_lead_statuses")
    .select("id")
    .eq("is_archived", true);
  const archivedSet = new Set((archivedRows ?? []).map((r) => r.id as string));

  const leadRows = await fetchAllRows<{
    id: string;
    company_name: string | null;
    website: string | null;
    city: string | null;
    crm_status_id: string | null;
    lifecycle_stage: string | null;
    created_at: string;
  }>(db, "leads", "id, company_name, website, city, crm_status_id, lifecycle_stage, created_at");

  const leads = leadRows.filter(
    (l) => !(l.crm_status_id && archivedSet.has(l.crm_status_id)) && l.lifecycle_stage !== "archived",
  );
  if (leads.length === 0) return [];

  // Aktivitaets-Gewichtung: Anrufe + Vertraege + Deals + Projekte pro Lead.
  const activity = new Map<string, number>();
  const bump = (id: string | null) => {
    if (!id) return;
    activity.set(id, (activity.get(id) ?? 0) + 1);
  };
  const [calls, contracts, deals, projects] = await Promise.all([
    fetchAllRows<{ lead_id: string | null }>(db, "lead_calls", "lead_id"),
    fetchAllRows<{ lead_id: string | null }>(db, "contracts", "lead_id"),
    fetchAllRows<{ lead_id: string | null }>(db, "deals", "lead_id"),
    fetchAllRows<{ lead_id: string | null }>(db, "projects", "lead_id"),
  ]);
  for (const t of [calls, contracts, deals, projects]) {
    for (const r of t) bump(r.lead_id);
  }

  const forCluster: LeadForCluster[] = leads.map((l) => ({
    id: l.id,
    company_name: l.company_name,
    website: l.website,
    city: l.city,
    crm_status_id: l.crm_status_id,
    lifecycle_stage: l.lifecycle_stage,
    created_at: l.created_at,
    activity: activity.get(l.id) ?? 0,
  }));

  const clusters = buildDuplicateClusters(forCluster);
  return clusters
    .map((c) => {
      const survivor = pickSurvivor(c);
      return { survivor, losers: c.filter((l) => l.id !== survivor.id) };
    })
    .sort((a, b) => b.losers.length - a.losers.length);
}

/** Fuehrt alle erkannten Cluster automatisch zusammen. Pro Cluster gekapselt,
 *  damit ein Fehler die uebrigen nicht abbricht. */
export async function mergeAllClusters(): Promise<{ merged: number; losers: number; errors: number; errorMessage?: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const db = createServiceClient();

  const clusters = await findDuplicateClusters();
  let merged = 0;
  let losersMerged = 0;
  let errors = 0;
  // Echte Fehlermeldungen sammeln, damit der Button den Grund anzeigen kann
  // (frueher wurden Fehler nur gezaehlt → "0 zusammengefuehrt" sah aus wie Erfolg).
  const errorMessages: string[] = [];

  for (const cluster of clusters) {
    try {
      for (const loser of cluster.losers) {
        const { error } = await db.rpc("merge_lead", {
          p_survivor: cluster.survivor.id,
          p_loser: loser.id,
        });
        if (error) throw new Error(error.message);
        losersMerged++;
      }
      // Vermerk im Aktivitäten-Feed des behaltenen Leads (best-effort).
      await insertMergeNote(db, cluster.survivor.id, cluster.losers);
      await logAudit({
        userId: user?.id ?? null,
        action: "lead.merged",
        entityType: "lead",
        entityId: cluster.survivor.id,
        details: {
          survivor: cluster.survivor.id,
          losers: cluster.losers.map((l) => l.id),
          company: cluster.survivor.company_name,
        },
      });
      merged++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(
        `[mergeAllClusters] Cluster (survivor ${cluster.survivor.id}) fehlgeschlagen:`,
        msg,
      );
      errors++;
      errorMessages.push(msg);
    }
  }

  revalidatePath("/admin/duplikate");
  revalidatePath("/leads");
  revalidatePath("/");

  // Repraesentative Fehlermeldung durchreichen. Den haeufigsten Fall — die
  // Postgres-Funktion merge_lead fehlt in der DB (Migration 101 nicht
  // angewandt) — in einen klaren Handlungshinweis uebersetzen.
  let errorMessage: string | undefined;
  if (errorMessages.length > 0) {
    const first = errorMessages[0];
    errorMessage = /could not find the function|pgrst202|function .*merge_lead.* does not exist|schema cache/i.test(first)
      ? "Die Datenbank-Funktion „merge_lead“ fehlt — Migration 101 (101_merge_lead_fix.sql) muss in Supabase ausgeführt werden."
      : first;
  }

  return { merged, losers: losersMerged, errors, errorMessage };
}
