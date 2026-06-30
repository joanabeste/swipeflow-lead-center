"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import { checkAdmin } from "@/lib/auth";

type AdminCtx = { user: { id: string }; db: SupabaseClient } | { error: string };
type ActionResult = { success: true } | { error: string };

// Admin-Wartung der gebuchten Provisionen (commission_events). Empfaenger,
// Betrag, Datum/Monat aendern, stornieren/reaktivieren und manuell anlegen.
// Jede Mutation revalidiert auch die persoenliche Ansicht + Dashboards, damit
// die Auszahlung dort sofort stimmt.

async function requireAdmin(): Promise<AdminCtx> {
  const ctx = await checkAdmin();
  if (!ctx) return { error: "Nur Administratoren." };
  return { user: ctx.user, db: createServiceClient() };
}

/** Nach jeder Mutation: Ledger, persoenliche Provisionsansicht und Dashboards. */
function revalidateCommissionViews() {
  revalidatePath("/admin/provisionen");
  revalidatePath("/zeit/provision");
  revalidatePath("/admin");
  revalidatePath("/admin/team");
}

function isMissingColumn(message: string): boolean {
  return /column .* does not exist/i.test(message);
}

const MIGRATION_HINT =
  "Spalten fehlen — Migration 069/070 (commission_events) muss in Supabase ausgeführt werden.";

/** Provision stornieren (reversibel): zaehlt nicht mehr zur Auszahlung. */
export async function voidCommissionEvent(eventId: string, reason?: string): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { error: ctx.error };

  const { error } = await ctx.db
    .from("commission_events")
    .update({
      voided_at: new Date().toISOString(),
      voided_by: ctx.user.id,
      void_reason: reason?.trim() || null,
    })
    .eq("id", eventId);
  if (error) {
    if (isMissingColumn(error.message)) return { error: MIGRATION_HINT };
    return { error: `DB-Fehler: ${error.message}` };
  }

  await logAudit({
    userId: ctx.user.id,
    action: "commission.event_voided",
    entityType: "commission_event",
    entityId: eventId,
    details: { reason: reason?.trim() || null },
  });
  revalidateCommissionViews();
  return { success: true };
}

/** Storno zuruecknehmen → Provision zaehlt wieder. */
export async function restoreCommissionEvent(eventId: string): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { error: ctx.error };

  const { error } = await ctx.db
    .from("commission_events")
    .update({ voided_at: null, voided_by: null, void_reason: null })
    .eq("id", eventId);
  if (error) {
    if (isMissingColumn(error.message)) return { error: MIGRATION_HINT };
    return { error: `DB-Fehler: ${error.message}` };
  }

  await logAudit({
    userId: ctx.user.id,
    action: "commission.event_restored",
    entityType: "commission_event",
    entityId: eventId,
    details: {},
  });
  revalidateCommissionViews();
  return { success: true };
}

/** Provision einer anderen Person zuweisen. */
export async function reassignCommissionEvent(eventId: string, newUserId: string): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { error: ctx.error };
  if (!newUserId) return { error: "Kein Empfänger gewählt." };

  const { data: target } = await ctx.db
    .from("profiles")
    .select("id, status")
    .eq("id", newUserId)
    .maybeSingle();
  if (!target) return { error: "Unbekannter Empfänger." };
  if ((target as { status: string }).status !== "active") {
    return { error: "Empfänger ist nicht aktiv." };
  }

  const { data: before } = await ctx.db
    .from("commission_events")
    .select("user_id")
    .eq("id", eventId)
    .maybeSingle();

  const { error } = await ctx.db
    .from("commission_events")
    .update({ user_id: newUserId })
    .eq("id", eventId);
  if (error) return { error: `DB-Fehler: ${error.message}` };

  await logAudit({
    userId: ctx.user.id,
    action: "commission.event_reassigned",
    entityType: "commission_event",
    entityId: eventId,
    details: { from: (before as { user_id: string } | null)?.user_id ?? null, to: newUserId },
  });
  revalidateCommissionViews();
  return { success: true };
}

/** Betrag anpassen (in Cent, >= 0). */
export async function updateCommissionEventAmount(eventId: string, amountCents: number): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { error: ctx.error };
  if (!Number.isFinite(amountCents) || amountCents < 0) {
    return { error: "Betrag muss eine Zahl >= 0 sein." };
  }

  const { error } = await ctx.db
    .from("commission_events")
    .update({ amount_cents: Math.round(amountCents) })
    .eq("id", eventId);
  if (error) return { error: `DB-Fehler: ${error.message}` };

  await logAudit({
    userId: ctx.user.id,
    action: "commission.event_amount_updated",
    entityType: "commission_event",
    entityId: eventId,
    details: { amount_cents: Math.round(amountCents) },
  });
  revalidateCommissionViews();
  return { success: true };
}

/** Datum aendern → ordnet die Provision einem anderen Monat zu. */
export async function updateCommissionEventEarnedAt(eventId: string, earnedAtIso: string): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { error: ctx.error };
  const ts = new Date(earnedAtIso);
  if (isNaN(ts.getTime())) return { error: "Ungültiges Datum." };

  const { data: before } = await ctx.db
    .from("commission_events")
    .select("earned_at")
    .eq("id", eventId)
    .maybeSingle();

  const { error } = await ctx.db
    .from("commission_events")
    .update({ earned_at: ts.toISOString() })
    .eq("id", eventId);
  if (error) return { error: `DB-Fehler: ${error.message}` };

  await logAudit({
    userId: ctx.user.id,
    action: "commission.event_earned_at_updated",
    entityType: "commission_event",
    entityId: eventId,
    details: { from: (before as { earned_at: string } | null)?.earned_at ?? null, to: ts.toISOString() },
  });
  revalidateCommissionViews();
  return { success: true };
}

/** Provision bestaetigen (z.B. Termin hat stattgefunden) → zaehlt als bestaetigt. */
export async function confirmCommissionEvent(eventId: string): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { error: ctx.error };

  const { error } = await ctx.db
    .from("commission_events")
    .update({ confirmed_at: new Date().toISOString(), confirmed_by: ctx.user.id })
    .eq("id", eventId);
  if (error) {
    if (isMissingColumn(error.message)) return { error: MIGRATION_HINT };
    return { error: `DB-Fehler: ${error.message}` };
  }

  await logAudit({
    userId: ctx.user.id,
    action: "commission.event_confirmed",
    entityType: "commission_event",
    entityId: eventId,
    details: {},
  });
  revalidateCommissionViews();
  return { success: true };
}

/** Bestaetigung zuruecknehmen → Provision wieder "voraussichtlich". */
export async function unconfirmCommissionEvent(eventId: string): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { error: ctx.error };

  const { error } = await ctx.db
    .from("commission_events")
    .update({ confirmed_at: null, confirmed_by: null })
    .eq("id", eventId);
  if (error) {
    if (isMissingColumn(error.message)) return { error: MIGRATION_HINT };
    return { error: `DB-Fehler: ${error.message}` };
  }

  await logAudit({
    userId: ctx.user.id,
    action: "commission.event_unconfirmed",
    entityType: "commission_event",
    entityId: eventId,
    details: {},
  });
  revalidateCommissionViews();
  return { success: true };
}

/** Provision manuell anlegen (ohne Regel): Bonus / nicht automatisch erfasst.
 *  Gilt sofort als bestaetigt (der Admin legt sie bewusst an). */
export async function createManualCommissionEvent(input: {
  leadId: string;
  userId: string;
  amountCents: number;
  note?: string;
  earnedAtIso?: string;
}): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { error: ctx.error };
  if (!input.leadId) return { error: "Kein Lead gewählt." };
  if (!input.userId) return { error: "Kein Empfänger gewählt." };
  if (!Number.isFinite(input.amountCents) || input.amountCents < 0) {
    return { error: "Betrag muss eine Zahl >= 0 sein." };
  }

  const [{ data: lead }, { data: target }] = await Promise.all([
    ctx.db.from("leads").select("id").eq("id", input.leadId).maybeSingle(),
    ctx.db.from("profiles").select("id, status").eq("id", input.userId).maybeSingle(),
  ]);
  if (!lead) return { error: "Unbekannter Lead." };
  if (!target) return { error: "Unbekannter Empfänger." };
  if ((target as { status: string }).status !== "active") return { error: "Empfänger ist nicht aktiv." };

  const earnedAt = input.earnedAtIso ? new Date(input.earnedAtIso) : new Date();
  if (isNaN(earnedAt.getTime())) return { error: "Ungültiges Datum." };

  const { data, error } = await ctx.db
    .from("commission_events")
    .insert({
      rule_id: null,
      lead_id: input.leadId,
      user_id: input.userId,
      amount_cents: Math.round(input.amountCents),
      currency: "EUR",
      trigger_status_id: null,
      earned_at: earnedAt.toISOString(),
      created_by: ctx.user.id,
      note: input.note?.trim() || null,
      confirmed_at: new Date().toISOString(),
      confirmed_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error) {
    if (isMissingColumn(error.message)) return { error: MIGRATION_HINT };
    return { error: `DB-Fehler: ${error.message}` };
  }

  await logAudit({
    userId: ctx.user.id,
    action: "commission.event_manual_created",
    entityType: "commission_event",
    entityId: (data as { id: string }).id,
    details: {
      lead_id: input.leadId,
      user_id: input.userId,
      amount_cents: Math.round(input.amountCents),
      note: input.note?.trim() || null,
    },
  });
  revalidateCommissionViews();
  return { success: true };
}

/** Lead-Suche fuer das Anlegen-Formular (Firmenname, max. 20 Treffer). */
export async function searchLeadsForCommission(
  query: string,
): Promise<{ leads: { id: string; company_name: string }[] } | { error: string }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { error: ctx.error };
  const q = query.trim();
  if (q.length < 2) return { leads: [] };

  const { data, error } = await ctx.db
    .from("leads")
    .select("id, company_name")
    .ilike("company_name", `%${q}%`)
    .is("deleted_at", null)
    .order("company_name", { ascending: true })
    .limit(20);
  if (error) return { error: `DB-Fehler: ${error.message}` };
  return { leads: (data as { id: string; company_name: string }[]) ?? [] };
}
