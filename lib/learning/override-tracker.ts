/**
 * Override-Tracking: passives Lernsignal, wenn ein User einen aussortierten
 * Lead manuell zurueck in die Pipeline zieht (cancelled/filtered -> qualified/
 * enriched/imported). Das ist der staerkste Hinweis, dass eine Cancel-Rule oder
 * eine automatische Entscheidung zu streng war.
 *
 * Wird vor jedem Status-Update einer Lead-Liste aufgerufen. Der Lern-Cron
 * aggregiert spaeter cancel_override_log.previous_cancel_reason_code, um
 * Cancel-Rules mit hoher Override-Rate zu identifizieren.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const RESCUED_OUT_OF_STATUSES = new Set(["cancelled", "filtered"]);
const RESCUED_INTO_STATUSES = new Set(["imported", "enriched", "qualified", "exported", "enrichment_pending"]);

interface LeadStateSnapshot {
  id: string;
  status: string;
  cancel_reason: string | null;
  cancel_reason_code: string | null;
  cancel_rule_id: string | null;
}

/** Liest den aktuellen Status der Leads vor einem Update. */
export async function captureLeadStates(
  db: SupabaseClient,
  leadIds: string[],
): Promise<LeadStateSnapshot[]> {
  if (leadIds.length === 0) return [];
  const { data } = await db
    .from("leads")
    .select("id, status, cancel_reason, cancel_reason_code, cancel_rule_id")
    .in("id", leadIds);
  return (data ?? []) as LeadStateSnapshot[];
}

/** Schreibt Override-Eintraege fuer Leads, die aus cancelled/filtered geholt
 * wurden. Idempotent: kein Override-Eintrag bei No-Op-Updates. Greift sich den
 * letzten factor_snapshot, damit der Lern-Cron Faktor-Verteilungen analysieren
 * kann. */
export async function logCancelOverrides(
  db: SupabaseClient,
  before: LeadStateSnapshot[],
  newStatus: string,
  overriddenBy: string | null,
): Promise<number> {
  if (!RESCUED_INTO_STATUSES.has(newStatus)) return 0;
  const rescued = before.filter(
    (b) => RESCUED_OUT_OF_STATUSES.has(b.status) && b.status !== newStatus,
  );
  if (rescued.length === 0) return 0;

  // Letzten Snapshot pro Lead holen (kompletter Faktor-Stand zum Zeitpunkt der
  // ungerechten Aussortierung). Es kann sein dass keiner existiert, dann
  // loggen wir trotzdem ohne Snapshot.
  const { data: snapshots } = await db
    .from("lead_enrichments")
    .select("lead_id, factor_snapshot, completed_at")
    .in("lead_id", rescued.map((r) => r.id))
    .not("factor_snapshot", "is", null)
    .order("completed_at", { ascending: false });

  const latestByLead = new Map<string, unknown>();
  for (const row of snapshots ?? []) {
    const r = row as { lead_id: string; factor_snapshot: unknown };
    if (!latestByLead.has(r.lead_id)) {
      latestByLead.set(r.lead_id, r.factor_snapshot);
    }
  }

  const entries = rescued.map((r) => ({
    lead_id: r.id,
    previous_status: r.status,
    new_status: newStatus,
    previous_cancel_reason: r.cancel_reason,
    previous_cancel_reason_code: r.cancel_reason_code,
    previous_cancel_rule_id: r.cancel_rule_id,
    factor_snapshot: latestByLead.get(r.id) ?? null,
    overridden_by: overriddenBy,
  }));

  const { error } = await db.from("cancel_override_log").insert(entries);
  if (error) {
    // Override-Logging ist Best-Effort — nicht den eigentlichen Status-Update kippen.
    console.error("[override-tracker] insert failed:", error.message);
    return 0;
  }
  return entries.length;
}
