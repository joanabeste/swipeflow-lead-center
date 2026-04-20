/**
 * Kuratierte Sammlung von Sales-Sprüchen — Mix aus Motivation, Humor und
 * klassischen Weisheiten. Bewusst deutsch, weil der Rest der App es ist.
 *
 * Jedes Quote hat optional einen "author" und einen "tone" für Styling.
 * Die Auswahl rotiert täglich (deterministisch aus dem Datum), damit nicht
 * bei jedem Page-Refresh ein anderer Spruch auftaucht.
 */

export type QuoteTone = "motivation" | "humor" | "classic" | "wisdom";

export interface SalesQuote {
  text: string;
  author?: string;
  tone: QuoteTone;
}

export const SALES_QUOTES: SalesQuote[] = [
  // ─── Motivation ─────────────────────────────────────────────
  { text: "Ein 'Nein' heute ist ein 'Ja' nächste Woche.", tone: "motivation" },
  { text: "Die beste Verkaufsstrategie: einen Anruf mehr als gestern.", tone: "motivation" },
  { text: "Jeder Profi war mal ein Anfänger mit 50 Absagen.", tone: "motivation" },
  { text: "Erfolg = 1 % Inspiration + 99 % Follow-Up.", tone: "motivation" },
  { text: "Der nächste Anruf bringt den Durchbruch.", tone: "motivation" },
  { text: "Dein Telefon wird nicht von selbst klingeln.", tone: "motivation" },
  { text: "Disziplin schlägt Motivation. Jeden. Einzelnen. Tag.", tone: "motivation" },
  { text: "Wer nicht fragt, closed nicht.", tone: "motivation" },
  { text: "Angebote verkaufen nicht. Menschen verkaufen.", tone: "motivation" },

  // ─── Klassisch ──────────────────────────────────────────────
  { text: "Verkaufen ist nicht überzeugen — es ist verstehen.", tone: "classic" },
  { text: "Der schlimmste Fehler ist, nichts zu tun, weil du nur wenig tun kannst.", author: "Edmund Burke", tone: "classic" },
  { text: "Wer aufhört zu werben, um Geld zu sparen, kann ebenso seine Uhr anhalten, um Zeit zu sparen.", author: "Henry Ford", tone: "classic" },
  { text: "Du verpasst 100 % der Schüsse, die du nicht machst.", author: "Wayne Gretzky", tone: "classic" },
  { text: "Unser größter Ruhm liegt nicht darin, niemals zu fallen, sondern jedes Mal wieder aufzustehen.", author: "Konfuzius", tone: "classic" },
  { text: "Verkaufen ist ein Kampf gegen die eigene Komfortzone.", tone: "classic" },

  // ─── Weisheit / Operativ ────────────────────────────────────
  { text: "Die zweite Call-Runde macht den Deal. Nicht die erste.", tone: "wisdom" },
  { text: "Pipeline ohne Termine ist eine Wunschliste.", tone: "wisdom" },
  
  // ─── Extra Motivation für schwere Tage ──────────────────────
  { text: "Das Telefon ist das günstigste Marketing-Tool der Welt. Benutze es.", tone: "motivation" },
  { text: "Wer den Hörer abnimmt, gewinnt.", tone: "motivation" },
  { text: "Du verkaufst nicht, du löst Probleme. Finde das Problem.", tone: "motivation" },
  { text: "Nichts ist vorbei, solange der Lead nicht 'Stop' gesagt hat.", tone: "motivation" },
  { text: "Konstanz schlägt Intensität.", tone: "wisdom" },
];

/**
 * Tagesspruch — deterministisch basierend auf dem heutigen Datum.
 * Dadurch bleibt der Spruch innerhalb eines Tages stabil, rotiert aber täglich.
 */
export function getQuoteOfDay(now: Date = new Date()): SalesQuote {
  // YYYY-MM-DD als Zahl — deterministischer Seed.
  const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  const idx = ((seed % SALES_QUOTES.length) + SALES_QUOTES.length) % SALES_QUOTES.length;
  return SALES_QUOTES[idx]!;
}
