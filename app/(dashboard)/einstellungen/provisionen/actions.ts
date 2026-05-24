"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import { checkAdmin } from "@/lib/auth";
import type { CommissionScope, UserRole } from "@/lib/types";

async function requireAdmin() {
  const ctx = await checkAdmin();
  if (!ctx) return { error: "Nur Administratoren." as const };
  return { user: ctx.user, db: createServiceClient() };
}

export interface CommissionRuleInput {
  name: string;
  trigger_status_id: string;
  amount_euros: number;
  scope: CommissionScope;
  scope_role: UserRole | null;
  scope_user_id: string | null;
  is_active: boolean;
}

function validate(input: CommissionRuleInput): string | null {
  if (!input.name.trim()) return "Name fehlt.";
  if (!input.trigger_status_id) return "Trigger-Status fehlt.";
  if (!Number.isFinite(input.amount_euros) || input.amount_euros < 0) {
    return "Betrag muss eine Zahl >= 0 sein.";
  }
  if (input.scope === "role" && !input.scope_role) return "Rolle muss gewählt werden.";
  if (input.scope === "user" && !input.scope_user_id) return "Mitarbeiter muss gewählt werden.";
  return null;
}

export async function createCommissionRule(input: CommissionRuleInput) {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { error: ctx.error };
  const err = validate(input);
  if (err) return { error: err };

  const { error, data } = await ctx.db
    .from("commission_rules")
    .insert({
      name: input.name.trim(),
      trigger_status_id: input.trigger_status_id,
      amount_cents: Math.round(input.amount_euros * 100),
      currency: "EUR",
      scope: input.scope,
      scope_role: input.scope === "role" ? input.scope_role : null,
      scope_user_id: input.scope === "user" ? input.scope_user_id : null,
      is_active: input.is_active,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[createCommissionRule] failed:", error);
    if (/relation.*does not exist/i.test(error.message)) {
      return { error: "Tabelle commission_rules fehlt — Migration 066 muss ausgeführt werden." };
    }
    return { error: `DB-Fehler: ${error.message}` };
  }

  await logAudit({
    userId: ctx.user.id,
    action: "commission.rule_created",
    entityType: "commission_rule",
    entityId: data.id as string,
    details: { ...input, amount_cents: Math.round(input.amount_euros * 100) },
  });

  revalidatePath("/einstellungen/provisionen");
  return { success: true };
}

export async function updateCommissionRule(id: string, input: CommissionRuleInput) {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { error: ctx.error };
  const err = validate(input);
  if (err) return { error: err };

  const { error } = await ctx.db
    .from("commission_rules")
    .update({
      name: input.name.trim(),
      trigger_status_id: input.trigger_status_id,
      amount_cents: Math.round(input.amount_euros * 100),
      scope: input.scope,
      scope_role: input.scope === "role" ? input.scope_role : null,
      scope_user_id: input.scope === "user" ? input.scope_user_id : null,
      is_active: input.is_active,
    })
    .eq("id", id);
  if (error) return { error: `DB-Fehler: ${error.message}` };

  await logAudit({
    userId: ctx.user.id,
    action: "commission.rule_updated",
    entityType: "commission_rule",
    entityId: id,
    details: { ...input },
  });
  revalidatePath("/einstellungen/provisionen");
  return { success: true };
}

export async function toggleCommissionRule(id: string, isActive: boolean) {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { error: ctx.error };
  const { error } = await ctx.db
    .from("commission_rules")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) return { error: `DB-Fehler: ${error.message}` };
  await logAudit({
    userId: ctx.user.id,
    action: "commission.rule_toggled",
    entityType: "commission_rule",
    entityId: id,
    details: { is_active: isActive },
  });
  revalidatePath("/einstellungen/provisionen");
  return { success: true };
}

export async function deleteCommissionRule(id: string) {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { error: ctx.error };
  const { error } = await ctx.db.from("commission_rules").delete().eq("id", id);
  if (error) return { error: `DB-Fehler: ${error.message}` };
  await logAudit({
    userId: ctx.user.id,
    action: "commission.rule_deleted",
    entityType: "commission_rule",
    entityId: id,
    details: {},
  });
  revalidatePath("/einstellungen/provisionen");
  return { success: true };
}

export async function updateProfileHourlyWage(profileId: string, euros: number | null) {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { error: ctx.error };
  if (euros !== null && (!Number.isFinite(euros) || euros < 0)) {
    return { error: "Stundenlohn muss eine Zahl >= 0 sein." };
  }
  const cents = euros === null ? null : Math.round(euros * 100);

  const { error } = await ctx.db
    .from("profiles")
    .update({ hourly_wage_cents: cents })
    .eq("id", profileId);
  if (error) {
    if (/column.*hourly_wage_cents.*does not exist/i.test(error.message)) {
      return { error: "Spalte hourly_wage_cents fehlt — Migration 065 muss ausgeführt werden." };
    }
    return { error: `DB-Fehler: ${error.message}` };
  }

  await logAudit({
    userId: ctx.user.id,
    action: "profile.hourly_wage_updated",
    entityType: "profile",
    entityId: profileId,
    details: { cents },
  });

  revalidatePath("/einstellungen/provisionen");
  revalidatePath("/zeit/admin/mitarbeiter");
  return { success: true };
}
