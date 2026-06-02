import type { SupabaseClient } from "@supabase/supabase-js";

interface MergedLoser {
  company_name?: string | null;
  city?: string | null;
  website?: string | null;
}

function describeLoser(l: MergedLoser): string {
  const name = l.company_name?.trim() || "Unbenannter Lead";
  const loc = [l.website, l.city].filter(Boolean).join(", ");
  return loc ? `${name} (${loc})` : name;
}

/**
 * Schreibt eine System-Notiz auf den behaltenen (Survivor-)Lead, dass ein oder
 * mehrere Duplikate in ihn zusammengeführt und archiviert wurden — sichtbar im
 * Aktivitäten-Feed (created_by=null → Autor "System").
 *
 * Best-effort: wirft NIE. Ein Fehler beim Notiz-Schreiben darf das eigentliche
 * Zusammenführen nicht beeinträchtigen (das ist via merge_lead bereits passiert).
 */
export async function insertMergeNote(
  db: SupabaseClient,
  survivorId: string,
  losers: MergedLoser[],
): Promise<void> {
  if (!survivorId || losers.length === 0) return;

  const content =
    losers.length === 1
      ? `🔀 Zusammengeführt: „${describeLoser(losers[0])}" wurde in diesen Lead übernommen und archiviert.`
      : `🔀 Zusammengeführt: ${losers.length} Duplikate übernommen und archiviert — ${losers
          .map(describeLoser)
          .join("; ")}.`;

  try {
    const { error } = await db.from("lead_notes").insert({
      lead_id: survivorId,
      content,
      created_by: null, // → Aktivitäten-Feed zeigt "System"
    });
    if (error) console.error("[insertMergeNote]", error.message);
  } catch (e) {
    console.error("[insertMergeNote] unerwartet:", e);
  }
}
