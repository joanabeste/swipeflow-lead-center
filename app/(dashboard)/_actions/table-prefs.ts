"use server";

// Persistiert das Tabellen-Layout (Reihenfolge, Breite, Sichtbarkeit) eines
// Users in user_table_preferences. Wird vom Client-Hook useColumnLayout
// debounced aufgerufen.

import { createClient } from "@/lib/supabase/server";
import type { ColumnPref, TableKey } from "@/lib/table-prefs";

export async function saveTablePrefs(tableKey: TableKey, columns: ColumnPref[]) {
  if (tableKey !== "leads" && tableKey !== "crm") return { error: "invalid_table_key" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "unauthenticated" };

  // Defensiver Sanity-Filter: keine Spalten-Keys mit Schmu, Width-Range begrenzt.
  const sanitized: ColumnPref[] = (columns ?? [])
    .filter((c): c is ColumnPref => typeof c?.key === "string" && c.key.length > 0)
    .map((c) => ({
      key: c.key,
      ...(typeof c.width === "number" && c.width >= 40 && c.width <= 1200
        ? { width: Math.round(c.width) }
        : {}),
      ...(c.hidden === true ? { hidden: true } : {}),
    }));

  const { error } = await supabase
    .from("user_table_preferences")
    .upsert(
      {
        user_id: user.id,
        table_key: tableKey,
        columns: sanitized,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,table_key" },
    );
  if (error) return { error: error.message };
  return { success: true };
}

export async function resetTablePrefs(tableKey: TableKey) {
  if (tableKey !== "leads" && tableKey !== "crm") return { error: "invalid_table_key" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "unauthenticated" };

  const { error } = await supabase
    .from("user_table_preferences")
    .delete()
    .eq("user_id", user.id)
    .eq("table_key", tableKey);
  if (error) return { error: error.message };
  return { success: true };
}
