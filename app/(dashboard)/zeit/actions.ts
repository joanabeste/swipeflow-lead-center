"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { requireZeitUser } from "@/lib/zeit/auth";
import { describeZeitError } from "@/lib/zeit/translate-error";
import { logAudit } from "@/lib/audit-log";

type ActionResult<T = unknown> = { success: true; data?: T } | { error: string };

function revalidateZeit() {
  revalidatePath("/zeit");
  revalidatePath("/zeit/eintraege");
  revalidatePath("/zeit/kalender");
  revalidatePath("/zeit/reports");
}

export async function startTimer(note: string | null): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireZeitUser();
  const db = createServiceClient();
  const { data, error } = await db
    .from("time_entries")
    .insert({
      user_id: ctx.user.id,
      started_at: new Date().toISOString(),
      ended_at: null,
      note: note?.trim() || null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[startTimer]", error);
    return { error: describeZeitError(error) };
  }
  await logAudit({ userId: ctx.user.id, action: "zeit.timer.start", entityType: "time_entry", entityId: data.id });
  revalidateZeit();
  return { success: true, data: { id: data.id } };
}

export async function stopTimer(entryId: string): Promise<ActionResult> {
  const ctx = await requireZeitUser();
  const db = createServiceClient();
  const { data: existing, error: readErr } = await db
    .from("time_entries")
    .select("user_id, ended_at")
    .eq("id", entryId)
    .single();
  if (readErr) return { error: describeZeitError(readErr) };
  if (!existing) return { error: "Eintrag nicht gefunden." };
  if (existing.user_id !== ctx.user.id && ctx.profile.role !== "admin") return { error: "Keine Berechtigung." };
  if (existing.ended_at) return { error: "Timer ist bereits gestoppt." };

  const { error } = await db
    .from("time_entries")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", entryId);
  if (error) {
    console.error("[stopTimer]", error);
    return { error: describeZeitError(error) };
  }
  await logAudit({ userId: ctx.user.id, action: "zeit.timer.stop", entityType: "time_entry", entityId: entryId });
  revalidateZeit();
  return { success: true };
}

export async function createManualEntry(input: {
  started_at: string;
  ended_at: string;
  note?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireZeitUser();
  const start = new Date(input.started_at);
  const end = new Date(input.ended_at);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { error: "Ungueltige Datumsangabe." };
  }
  if (end <= start) return { error: "Ende muss nach dem Start liegen." };
  const db = createServiceClient();
  const { data, error } = await db
    .from("time_entries")
    .insert({
      user_id: ctx.user.id,
      started_at: start.toISOString(),
      ended_at: end.toISOString(),
      note: input.note?.trim() || null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[createManualEntry]", error);
    return { error: describeZeitError(error) };
  }
  await logAudit({ userId: ctx.user.id, action: "zeit.entry.create", entityType: "time_entry", entityId: data.id });
  revalidateZeit();
  return { success: true, data: { id: data.id } };
}

export async function updateEntry(
  entryId: string,
  input: { started_at: string; ended_at: string | null; note?: string | null },
): Promise<ActionResult> {
  const ctx = await requireZeitUser();
  const db = createServiceClient();
  const { data: existing, error: readErr } = await db
    .from("time_entries")
    .select("user_id")
    .eq("id", entryId)
    .single();
  if (readErr) return { error: describeZeitError(readErr) };
  if (!existing) return { error: "Eintrag nicht gefunden." };
  if (existing.user_id !== ctx.user.id && ctx.profile.role !== "admin") return { error: "Keine Berechtigung." };

  const start = new Date(input.started_at);
  const end = input.ended_at ? new Date(input.ended_at) : null;
  if (Number.isNaN(start.getTime())) return { error: "Ungueltiger Startzeitpunkt." };
  if (end && Number.isNaN(end.getTime())) return { error: "Ungueltiges Ende." };
  if (end && end <= start) return { error: "Ende muss nach dem Start liegen." };

  const { error } = await db
    .from("time_entries")
    .update({
      started_at: start.toISOString(),
      ended_at: end ? end.toISOString() : null,
      note: input.note?.trim() || null,
    })
    .eq("id", entryId);
  if (error) {
    console.error("[updateEntry]", error);
    return { error: describeZeitError(error) };
  }
  await logAudit({ userId: ctx.user.id, action: "zeit.entry.update", entityType: "time_entry", entityId: entryId });
  revalidateZeit();
  return { success: true };
}

export async function updateEntryNote(entryId: string, note: string | null): Promise<ActionResult> {
  const ctx = await requireZeitUser();
  const db = createServiceClient();
  const { data: existing, error: readErr } = await db
    .from("time_entries")
    .select("user_id")
    .eq("id", entryId)
    .single();
  if (readErr) return { error: describeZeitError(readErr) };
  if (!existing) return { error: "Eintrag nicht gefunden." };
  if (existing.user_id !== ctx.user.id && ctx.profile.role !== "admin") return { error: "Keine Berechtigung." };

  const { error } = await db
    .from("time_entries")
    .update({ note: note?.trim() || null })
    .eq("id", entryId);
  if (error) {
    console.error("[updateEntryNote]", error);
    return { error: describeZeitError(error) };
  }
  await logAudit({ userId: ctx.user.id, action: "zeit.entry.update_note", entityType: "time_entry", entityId: entryId });
  revalidateZeit();
  return { success: true };
}

export async function deleteEntry(entryId: string): Promise<ActionResult> {
  const ctx = await requireZeitUser();
  const db = createServiceClient();
  const { data: existing, error: readErr } = await db
    .from("time_entries")
    .select("user_id")
    .eq("id", entryId)
    .single();
  if (readErr) return { error: describeZeitError(readErr) };
  if (!existing) return { error: "Eintrag nicht gefunden." };
  if (existing.user_id !== ctx.user.id && ctx.profile.role !== "admin") return { error: "Keine Berechtigung." };

  const { error } = await db.from("time_entries").delete().eq("id", entryId);
  if (error) return { error: describeZeitError(error) };
  await logAudit({ userId: ctx.user.id, action: "zeit.entry.delete", entityType: "time_entry", entityId: entryId });
  revalidateZeit();
  return { success: true };
}
