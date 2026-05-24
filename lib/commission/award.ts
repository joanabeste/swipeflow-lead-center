import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Wird nach jedem CRM-Status-Wechsel aufgerufen. Findet aktive
 * commission_rules, deren trigger_status_id mit dem neuen Status uebereinstimmt
 * und deren Scope (all / role / user) auf den assigned_to-User des Leads passt.
 * Inserts sind idempotent (UNIQUE(rule_id, lead_id) in 068).
 *
 * Schluckt Fehler bewusst weich (return statt throw), damit ein fehlendes
 * Migrations-Setup den eigentlichen Status-Wechsel nicht blockiert.
 */
export async function awardCommissionsForStatusChange(
  db: SupabaseClient,
  leadId: string,
  newStatusId: string | null,
): Promise<{ inserted: number; skipped: number; error?: string }> {
  if (!newStatusId) return { inserted: 0, skipped: 0 };

  const { data: lead, error: leadErr } = await db
    .from("leads")
    .select("id, assigned_to")
    .eq("id", leadId)
    .single();
  if (leadErr || !lead) return { inserted: 0, skipped: 0, error: leadErr?.message };
  const assignedTo = (lead as { assigned_to: string | null }).assigned_to;
  if (!assignedTo) return { inserted: 0, skipped: 0 };

  const { data: profile, error: profErr } = await db
    .from("profiles")
    .select("id, role")
    .eq("id", assignedTo)
    .single();
  if (profErr || !profile) return { inserted: 0, skipped: 0, error: profErr?.message };
  const assigneeRole = (profile as { role: string }).role;

  const { data: rules, error: rulesErr } = await db
    .from("commission_rules")
    .select("id, amount_cents, currency, scope, scope_role, scope_user_id, is_active")
    .eq("trigger_status_id", newStatusId)
    .eq("is_active", true);
  if (rulesErr) {
    // Tabelle existiert evtl. noch nicht — leise schlucken.
    if (/relation.*does not exist/i.test(rulesErr.message)) {
      return { inserted: 0, skipped: 0 };
    }
    return { inserted: 0, skipped: 0, error: rulesErr.message };
  }
  if (!rules || rules.length === 0) return { inserted: 0, skipped: 0 };

  type Rule = {
    id: string;
    amount_cents: number;
    currency: string;
    scope: "all" | "role" | "user";
    scope_role: string | null;
    scope_user_id: string | null;
  };

  const matching = (rules as Rule[]).filter((r) => {
    if (r.scope === "all") return true;
    if (r.scope === "role") return r.scope_role === assigneeRole;
    if (r.scope === "user") return r.scope_user_id === assignedTo;
    return false;
  });
  if (matching.length === 0) return { inserted: 0, skipped: 0 };

  const rows = matching.map((r) => ({
    rule_id: r.id,
    lead_id: leadId,
    user_id: assignedTo,
    amount_cents: r.amount_cents,
    currency: r.currency,
    trigger_status_id: newStatusId,
  }));

  // onConflict auf (rule_id, lead_id) — bereits gebuchte Events bleiben unangetastet.
  const { data: inserted, error: insErr } = await db
    .from("commission_events")
    .upsert(rows, { onConflict: "rule_id,lead_id", ignoreDuplicates: true })
    .select("id");
  if (insErr) {
    if (/relation.*does not exist/i.test(insErr.message)) {
      return { inserted: 0, skipped: 0 };
    }
    return { inserted: 0, skipped: rows.length, error: insErr.message };
  }

  const insertedCount = inserted?.length ?? 0;
  return { inserted: insertedCount, skipped: rows.length - insertedCount };
}
