"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { requireZeitUser } from "@/lib/zeit/auth";
import { describeZeitError } from "@/lib/zeit/translate-error";
import { logAudit } from "@/lib/audit-log";
import type { AbsenceType } from "@/lib/zeit/types";

type ActionResult<T = unknown> = { success: true; data?: T } | { error: string };

const TYPES: AbsenceType[] = ["vacation", "sick", "other"];

export async function createAbsence(input: {
  type: AbsenceType;
  date_from: string;
  date_to: string;
  note?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireZeitUser();
  if (!TYPES.includes(input.type)) return { error: "Ungueltiger Abwesenheits-Typ." };
  if (!input.date_from || !input.date_to) return { error: "Zeitraum fehlt." };
  if (input.date_to < input.date_from) return { error: "End-Datum darf nicht vor Start-Datum liegen." };

  const db = createServiceClient();
  const { data, error } = await db
    .from("absences")
    .insert({
      user_id: ctx.user.id,
      type: input.type,
      date_from: input.date_from,
      date_to: input.date_to,
      status: "pending",
      note: input.note?.trim() || null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[createAbsence]", error);
    return { error: describeZeitError(error) };
  }
  await logAudit({ userId: ctx.user.id, action: "zeit.absence.create", entityType: "absence", entityId: data.id });
  revalidatePath("/zeit/abwesenheiten");
  revalidatePath("/zeit/admin/abwesenheiten");
  revalidatePath("/zeit/kalender");
  return { success: true, data: { id: data.id } };
}

export async function deleteAbsence(id: string): Promise<ActionResult> {
  const ctx = await requireZeitUser();
  const db = createServiceClient();
  const { data: existing } = await db
    .from("absences")
    .select("user_id, status")
    .eq("id", id)
    .single();
  if (!existing) return { error: "Antrag nicht gefunden." };
  if (existing.user_id !== ctx.user.id && ctx.profile.role !== "admin") return { error: "Keine Berechtigung." };
  if (existing.status !== "pending" && ctx.profile.role !== "admin")
    return { error: "Nur ausstehende Antraege koennen geloescht werden." };

  const { error } = await db.from("absences").delete().eq("id", id);
  if (error) return { error: describeZeitError(error) };
  await logAudit({ userId: ctx.user.id, action: "zeit.absence.delete", entityType: "absence", entityId: id });
  revalidatePath("/zeit/abwesenheiten");
  revalidatePath("/zeit/admin/abwesenheiten");
  revalidatePath("/zeit/kalender");
  return { success: true };
}
