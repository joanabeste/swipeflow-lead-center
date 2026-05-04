"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";

async function currentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
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
export async function addStandaloneTodo(title: string, dueDate: string, leadId: string | null) {
  const user = await currentUser();
  if (!user) return { error: "Nicht angemeldet." };
  const trimmed = title.trim();
  if (!trimmed) return { error: "Titel darf nicht leer sein." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { error: "Ungültiges Datum." };

  const db = createServiceClient();
  const { error } = await db
    .from("lead_todos")
    .insert({ lead_id: leadId, title: trimmed, due_date: dueDate, created_by: user.id });
  if (error) {
    if (/lead_id.*null/i.test(error.message)) {
      return { error: "Bitte wähle einen Lead — Todos müssen einem Lead zugeordnet werden." };
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
