import { createClient } from "@/lib/supabase/server";
import type { BlacklistEntry, BlacklistRule, CancelRule } from "@/lib/types";
import { BlacklistManager } from "./blacklist-manager";
import { CancelRulesManager } from "./cancel-rules-manager";

export default async function BlacklistPage() {
  const supabase = await createClient();

  const [{ data: entries }, { data: rules }, { data: cancelRules }] = await Promise.all([
    supabase.from("blacklist_entries").select("*").order("match_value"),
    supabase.from("blacklist_rules").select("*").order("created_at", { ascending: false }),
    supabase.from("cancel_rules").select("*").order("created_at", { ascending: false }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Ausschluss & Blacklist</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Unerwünschte Unternehmen manuell blockieren oder automatisch ausschließen
      </p>

      <BlacklistManager
        entries={(entries as BlacklistEntry[]) ?? []}
        rules={(rules as BlacklistRule[]) ?? []}
      />

      <div className="mt-10 border-t border-gray-200 pt-8 dark:border-gray-800">
        <h2 className="text-lg font-bold">Ausschlussregeln (automatisch)</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Leads werden automatisch ausgeschlossen, wenn diese Regeln zutreffen — beim Import und/oder nach der Anreicherung.
        </p>
        <div className="mt-4">
          <CancelRulesManager rules={(cancelRules as CancelRule[]) ?? []} />
        </div>
      </div>
    </div>
  );
}
