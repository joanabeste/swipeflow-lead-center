// Geteilte Read-Helper fuer die /zeit-Routen. Defensiv gegen fehlende Tabellen
// (Migrationen 062–064 noch nicht ausgefuehrt) — UI bleibt nutzbar, zeigt aber leere Daten.

import { createServiceClient } from "@/lib/supabase/server";
import type { Absence, TimeEntry } from "@/lib/zeit/types";

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  return /relation.*does not exist/i.test(error.message ?? "");
}

export async function loadRunningEntry(userId: string): Promise<TimeEntry | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("time_entries")
    .select("*")
    .eq("user_id", userId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle<TimeEntry>();
  if (error && !isMissingTable(error)) {
    console.error("[loadRunningEntry]", error);
  }
  return data ?? null;
}

export async function loadEntriesInRange(userId: string, from: Date, to: Date): Promise<TimeEntry[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("time_entries")
    .select("*")
    .eq("user_id", userId)
    .gte("started_at", from.toISOString())
    .lt("started_at", to.toISOString())
    .order("started_at", { ascending: true });
  if (error) {
    if (!isMissingTable(error)) console.error("[loadEntriesInRange]", error);
    return [];
  }
  return (data ?? []) as TimeEntry[];
}

export async function loadRecentEntries(userId: string, limit = 100): Promise<TimeEntry[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("time_entries")
    .select("*")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (!isMissingTable(error)) console.error("[loadRecentEntries]", error);
    return [];
  }
  return (data ?? []) as TimeEntry[];
}

export async function loadOwnAbsences(userId: string): Promise<Absence[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("absences")
    .select("*")
    .eq("user_id", userId)
    .order("date_from", { ascending: false });
  if (error) {
    if (!isMissingTable(error)) console.error("[loadOwnAbsences]", error);
    return [];
  }
  return (data ?? []) as Absence[];
}

export async function loadPendingAbsencesCount(): Promise<number> {
  const db = createServiceClient();
  const { count, error } = await db
    .from("absences")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) {
    if (!isMissingTable(error)) console.error("[loadPendingAbsencesCount]", error);
    return 0;
  }
  return count ?? 0;
}

export async function loadAllAbsences(): Promise<Absence[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("absences")
    .select("*")
    .order("date_from", { ascending: false });
  if (error) {
    if (!isMissingTable(error)) console.error("[loadAllAbsences]", error);
    return [];
  }
  return (data ?? []) as Absence[];
}

export async function loadAllEntriesInRange(from: Date, to: Date): Promise<TimeEntry[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("time_entries")
    .select("*")
    .gte("started_at", from.toISOString())
    .lt("started_at", to.toISOString())
    .order("started_at", { ascending: true });
  if (error) {
    if (!isMissingTable(error)) console.error("[loadAllEntriesInRange]", error);
    return [];
  }
  return (data ?? []) as TimeEntry[];
}

export async function loadAllProfiles(): Promise<Array<{ id: string; name: string; email: string; role: string }>> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("profiles")
    .select("id, name, email, role")
    .order("name", { ascending: true });
  if (error) {
    console.error("[loadAllProfiles]", error);
    return [];
  }
  return (data ?? []) as Array<{ id: string; name: string; email: string; role: string }>;
}
