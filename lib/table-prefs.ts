// Server-seitiges Lesen der pro-User-Tabellen-Layouts (Reihenfolge, Breite,
// Sichtbarkeit). Wird von Server-Components in /leads und /crm aufgerufen.
// Schreibend: app/(dashboard)/_actions/table-prefs.ts.

import "server-only";
import { createClient } from "@/lib/supabase/server";

export type TableKey = "leads" | "crm";

export interface ColumnPref {
  key: string;
  width?: number;
  hidden?: boolean;
}

export async function loadTablePrefs(tableKey: TableKey): Promise<ColumnPref[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("user_table_preferences")
    .select("columns")
    .eq("user_id", user.id)
    .eq("table_key", tableKey)
    .maybeSingle();

  const raw = (data?.columns ?? []) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isColumnPref);
}

function isColumnPref(v: unknown): v is ColumnPref {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.key === "string"
    && (o.width === undefined || typeof o.width === "number")
    && (o.hidden === undefined || typeof o.hidden === "boolean");
}
