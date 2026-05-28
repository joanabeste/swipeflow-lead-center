import type { SupabaseClient } from "@supabase/supabase-js";

const PAGE = 1000;

/** Laedt ALLE Zeilen einer Tabelle ueber Pagination und umgeht damit das
 *  PostgREST-Default-Limit von 1000 Zeilen. Stabil sortiert ueber id. */
export async function fetchAllRows<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}
