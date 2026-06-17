import type { SupabaseClient } from "@supabase/supabase-js";

// Einmalig pro Server-Prozess gemerkt, sobald leads.last_call_at existiert
// (Migration 126 eingespielt). Vorher wird NICHT gecacht → es wird bei jedem
// CRM-Aufruf erneut billig geprobt, bis die Spalte da ist. So schaltet die Seite
// nach dem Einspielen der Migration ohne Neustart automatisch um (Migrationen
// werden hier von Hand eingespielt und haengen oft hinterher).
let lastCallAtReady = false;

/**
 * True, sobald die Spalte `leads.last_call_at` existiert (Migration 126). Solange
 * sie fehlt, false → das CRM-Board faellt auf den alten Inline-ID-Pfad zurueck.
 */
export async function leadsHasLastCallAt(db: SupabaseClient): Promise<boolean> {
  if (lastCallAtReady) return true;
  const { error } = await db.from("leads").select("last_call_at").limit(1);
  if (!error) {
    lastCallAtReady = true;
    return true;
  }
  // 42703 = undefined_column. Jeder Fehler → vorerst false (kein Cachen).
  return false;
}
