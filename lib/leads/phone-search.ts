import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Kanonische Ziffernfolge einer Telefon-(Such-)Eingabe — IDENTISCH zur SQL-Logik
 * der generierten Spalte `leads.phone_norm` (Migration 122):
 *   nur Ziffern; "00…" → ohne "00"; "0…" → "49" + Rest; sonst unverändert.
 *
 * Dadurch matcht jede Schreibweise derselben Nummer denselben Wert — Trenner
 * (Leerzeichen, "-", "(", ")", "/"), führende 0, +49, 0049 spielen keine Rolle.
 *
 *   canonicalPhoneDigits("0571 9724927")    === "495719724927"
 *   canonicalPhoneDigits("+49 571 9724927") === "495719724927"
 *   canonicalPhoneDigits("0049571/9724927") === "495719724927"
 *   canonicalPhoneDigits("+4954226221")     === "4954226221"
 *
 * Achtung: Diese Funktion und die CASE-Logik in Migration 122 MÜSSEN für reale
 * Nummern dasselbe liefern — sonst weicht der gesuchte Wert vom gespeicherten ab.
 * Einziger bewusster Unterschied: bei leerer/zifferloser Eingabe liefert JS "" und
 * SQL NULL — beides „keine suchbare Nummer" (Aufrufer überspringt via `if (canon)`,
 * NULL matcht ohnehin kein ILIKE), für die Suche also äquivalent.
 */
export function canonicalPhoneDigits(raw: string): string {
  const dig = raw.replace(/\D/g, "");
  if (dig === "") return "";
  if (dig.startsWith("00")) return dig.slice(2);
  if (dig.startsWith("0")) return "49" + dig.slice(1);
  return dig;
}

// Einmalig pro Server-Prozess gemerkt, sobald leads.phone_norm existiert
// (Migration 122 eingespielt). Vorher wird NICHT gecacht → es wird bei jeder
// Suche erneut billig geprobt, bis die Spalte da ist. So bricht die Suche nicht,
// solange die Migration noch fehlt (Migrationen werden hier von Hand eingespielt).
let phoneNormReady = false;

/**
 * True, sobald die generierte Spalte `leads.phone_norm` existiert. Solange sie
 * fehlt, false (und die Suche nutzt nur die migrationsunabhängigen Klauseln).
 */
export async function leadsHasPhoneNorm(db: SupabaseClient): Promise<boolean> {
  if (phoneNormReady) return true;
  const { error } = await db.from("leads").select("phone_norm").limit(1);
  if (!error) {
    phoneNormReady = true;
    return true;
  }
  // 42703 = undefined_column. Jeder Fehler → vorerst false (kein Cachen), damit
  // nach dem Einspielen der Migration ohne Neustart automatisch umgeschaltet wird.
  return false;
}
