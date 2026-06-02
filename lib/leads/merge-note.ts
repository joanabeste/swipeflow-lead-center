import type { SupabaseClient } from "@supabase/supabase-js";

interface MergedLoser {
  id?: string | null;
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

  // Verlinkt das Herkunfts-Badge dieser Merge-Notiz auf den (archivierten)
  // Ursprungs-Lead, damit man ihn von hier aus ansehen/wiederherstellen ("trennen")
  // kann. Bei mehreren Verlierern verweist es auf den ersten; die übrigen sind
  // über ihre eigenen übernommenen Notizen erreichbar.
  const primary = losers[0];

  try {
    const { error } = await db.from("lead_notes").insert({
      lead_id: survivorId,
      content,
      created_by: null, // → Aktivitäten-Feed zeigt "System"
      merged_from_lead_id: primary.id ?? null,
      merged_from_company: primary.company_name?.trim() || null,
    });
    if (error) console.error("[insertMergeNote]", error.message);
  } catch (e) {
    console.error("[insertMergeNote] unerwartet:", e);
  }
}

/**
 * Schreibt eine System-Notiz, dass die offizielle Website-Nummer (Impressum/
 * Kontakt) die bisherige Lead-Nummer ersetzt hat — sichtbar im Aktivitäten-Feed
 * (created_by=null → Autor "System"). Die alte Nummer wird zusätzlich als Kontakt
 * bewahrt; hier wird der Tausch dokumentiert.
 *
 * Best-effort: wirft NIE. Ein Fehler beim Notiz-Schreiben darf die Anreicherung
 * nicht beeinträchtigen.
 */
export async function insertPhoneSwapNote(
  db: SupabaseClient,
  leadId: string,
  oldPhone: string | null,
  newPhone: string,
): Promise<void> {
  if (!leadId || !newPhone) return;

  const content =
    `📞 Offizielle Website-Nummer übernommen: ${oldPhone ?? "—"} → ${newPhone} ` +
    `(aus Impressum/Kontakt, Konfidenz hoch). Die bisherige Nummer wurde als Kontakt gesichert.`;

  try {
    const { error } = await db.from("lead_notes").insert({
      lead_id: leadId,
      content,
      created_by: null, // → Aktivitäten-Feed zeigt "System"
    });
    if (error) console.error("[insertPhoneSwapNote]", error.message);
  } catch (e) {
    console.error("[insertPhoneSwapNote] unerwartet:", e);
  }
}

/**
 * Schreibt eine Notiz, dass ein Duplikat-Vorschlag geprüft und als KEIN Duplikat
 * bestätigt wurde — sichtbar im Aktivitäten-Feed. Anders als die Merge-/System-
 * Notizen wird hier der entscheidende Nutzer als Autor gesetzt (created_by=userId),
 * damit die Historie zeigt, WER die Entscheidung getroffen hat.
 *
 * Best-effort: wirft NIE.
 */
export async function insertNoDuplicateNote(
  db: SupabaseClient,
  leadId: string,
  otherCompany: string | null,
  userId: string | null,
): Promise<void> {
  if (!leadId) return;

  const other = otherCompany?.trim() || "ein anderer Lead";
  const content =
    `🟢 Duplikat-Prüfung: „${other}" wurde gefunden, aber als KEIN Duplikat bestätigt — ` +
    `der Duplikat-Vorschlag wurde verworfen.`;

  try {
    const { error } = await db.from("lead_notes").insert({
      lead_id: leadId,
      content,
      created_by: userId, // entscheidender Nutzer → erscheint mit Namen im Feed
    });
    if (error) console.error("[insertNoDuplicateNote]", error.message);
  } catch (e) {
    console.error("[insertNoDuplicateNote] unerwartet:", e);
  }
}
