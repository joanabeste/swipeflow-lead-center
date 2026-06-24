"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";

async function currentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** Lead-Typeahead für den Quick-Add: durchsucht serverseitig die GESAMTE Lead-DB
 *  (Name + Stadt), nicht nur die vorgeladenen Top-300. Idiom wie searchLeadsForDeal. */
export async function searchLeadsForTodo(query: string): Promise<{
  leads: { id: string; company_name: string; city: string | null }[];
}> {
  const user = await currentUser();
  if (!user) return { leads: [] };
  const q = query.trim();
  if (q.length < 2) return { leads: [] };
  const db = createServiceClient();
  // ilike-Wildcards & PostgREST-or-Trenner entschärfen (vgl. escapeIlikeWildcards in leads/)
  const safe = q.slice(0, 100).replace(/[%_,()\\]/g, " ");
  const { data } = await db
    .from("leads")
    .select("id, company_name, city")
    .is("deleted_at", null)
    .or(`company_name.ilike.%${safe}%,city.ilike.%${safe}%`)
    .order("company_name", { ascending: true })
    .limit(8);
  return { leads: (data ?? []) as { id: string; company_name: string; city: string | null }[] };
}

/** Bulk-Reschedule: verschiebt mehrere Todos um N Tage. */
export async function bulkRescheduleTodos(todoIds: string[], deltaDays: number) {
  const user = await currentUser();
  if (!user) return { error: "Nicht angemeldet." };
  if (todoIds.length === 0) return { success: true };

  const db = createServiceClient();
  const { data: todos } = await db
    .from("lead_todos")
    .select("id, due_date")
    .in("id", todoIds);
  if (!todos) return { error: "Todos nicht gefunden." };

  // Pro Todo neues Datum berechnen — wir verzichten auf SQL-DATE-Arithmetik,
  // damit Server-Zeitzonen den Stichtag nicht verschieben.
  for (const t of todos) {
    const next = addDays(t.due_date as string, deltaDays);
    const { error } = await db
      .from("lead_todos")
      .update({ due_date: next, updated_at: new Date().toISOString() })
      .eq("id", t.id);
    if (error) return { error: `DB-Fehler: ${error.message}` };
  }

  await logAudit({
    userId: user.id,
    action: "todo.bulk_rescheduled",
    entityType: "lead_todo",
    details: { todo_count: todoIds.length, delta_days: deltaDays },
  });

  revalidatePath("/todos");
  revalidatePath("/crm");
  revalidatePath("/");
  return { success: true };
}

/** Bulk-Erledigen mehrerer Todos. */
export async function bulkCompleteTodos(todoIds: string[]) {
  const user = await currentUser();
  if (!user) return { error: "Nicht angemeldet." };
  if (todoIds.length === 0) return { success: true };

  const db = createServiceClient();
  const now = new Date().toISOString();
  const { error } = await db
    .from("lead_todos")
    .update({ done_at: now, updated_at: now })
    .in("id", todoIds);
  if (error) return { error: `DB-Fehler: ${error.message}` };

  await logAudit({
    userId: user.id,
    action: "todo.bulk_completed",
    entityType: "lead_todo",
    details: { todo_count: todoIds.length },
  });

  revalidatePath("/todos");
  revalidatePath("/crm");
  revalidatePath("/");
  return { success: true };
}

/** Bulk-Löschen mehrerer Todos. */
export async function bulkDeleteTodos(todoIds: string[]) {
  const user = await currentUser();
  if (!user) return { error: "Nicht angemeldet." };
  if (todoIds.length === 0) return { success: true };

  const db = createServiceClient();
  const { error } = await db.from("lead_todos").delete().in("id", todoIds);
  if (error) return { error: `DB-Fehler: ${error.message}` };

  await logAudit({
    userId: user.id,
    action: "todo.bulk_deleted",
    entityType: "lead_todo",
    details: { todo_count: todoIds.length },
  });

  revalidatePath("/todos");
  revalidatePath("/crm");
  revalidatePath("/");
  return { success: true };
}

/** Standalone-Todo (ohne Lead) — wird mit lead_id NULL gespeichert.
 *  Falls die DB-Spalte NOT NULL ist, fängt der Aufrufer den Fehler ab. */
export async function addStandaloneTodo(
  title: string,
  dueDate: string,
  leadId: string | null,
  dueTime?: string | null,
  ownerId?: string | null,
) {
  const user = await currentUser();
  if (!user) return { error: "Nicht angemeldet." };
  const trimmed = title.trim();
  if (!trimmed) return { error: "Titel darf nicht leer sein." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { error: "Ungültiges Datum." };
  if (dueTime && !/^\d{2}:\d{2}$/.test(dueTime)) return { error: "Ungültige Uhrzeit." };

  const db = createServiceClient();
  // created_by ist hier der „Besitzer" der ToDo: standardmäßig man selbst, optional
  // ein Kollege (Zuweisung). Wer tatsächlich angelegt hat, steht im audit_log.
  const owner = ownerId ?? user.id;
  const payload: Record<string, unknown> = { lead_id: leadId, title: trimmed, due_date: dueDate, created_by: owner };
  // due_time nur schreiben, wenn gesetzt — so funktionieren zeitlose ToDos auch
  // ohne Migration 124 weiter.
  if (dueTime) payload.due_time = dueTime;
  const { error } = await db.from("lead_todos").insert(payload);
  if (error) {
    if (/lead_id.*null/i.test(error.message)) {
      return { error: "Bitte wähle einen Lead — Todos müssen einem Lead zugeordnet werden." };
    }
    if (error.code === "42703" || /due_time/i.test(error.message)) {
      return { error: "Spalte due_time fehlt — Migration 124 muss in Supabase ausgeführt werden." };
    }
    return { error: `DB-Fehler: ${error.message}` };
  }

  revalidatePath("/todos");
  revalidatePath("/crm");
  revalidatePath("/");
  return { success: true };
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
