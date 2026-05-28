// Formatierungshelfer für Verträge.

export function formatEuro(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

/**
 * Parst eine Euro-Eingabe robust zu Cent. Akzeptiert deutsche ("2.000,50")
 * und einfache ("2000.50" / "2000") Formate. Tausenderpunkte werden entfernt,
 * Komma als Dezimaltrennzeichen interpretiert.
 */
export function parseEuroToCents(input: string): number {
  let s = (input ?? "").trim().replace(/[^\d.,]/g, "");
  if (!s) return 0;
  if (s.includes(",")) {
    // Deutsches Format: Punkte sind Tausender, Komma ist Dezimal.
    s = s.replace(/\./g, "").replace(",", ".");
  }
  // sonst: nur Ziffern (+ ggf. ein Punkt als Dezimaltrenner) — unverändert lassen.
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Entfernt Leerzeichen und macht Großbuchstaben — IBAN-Normalisierung. */
export function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

export function ibanLast4(iban: string): string {
  return normalizeIban(iban).slice(-4);
}

/** Formatiert eine IBAN lesbar in 4er-Gruppen: DE12 3456 7890 1234 5678 90 */
export function formatIban(iban: string): string {
  return normalizeIban(iban).replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Validiert eine IBAN über Länge + ISO-7064 Mod-97-Prüfsumme (ohne externe Lib).
 * Akzeptiert IBANs aus allen Ländern, prüft aber Länge nur grob (15–34).
 */
export function isValidIban(raw: string): boolean {
  const iban = normalizeIban(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  // Erste 4 Zeichen ans Ende, Buchstaben → Zahlen (A=10 … Z=35).
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch >= "A" && ch <= "Z" ? (ch.charCodeAt(0) - 55).toString() : ch;
    for (const d of code) {
      remainder = (remainder * 10 + Number(d)) % 97;
    }
  }
  return remainder === 1;
}

/**
 * Teilt einen Cent-Betrag deterministisch in N Raten.
 * Alle Raten gleich, die letzte trägt den Rest.
 */
export function splitInstallments(totalCents: number, count: number): { base: number; last: number } {
  if (count <= 1) return { base: totalCents, last: totalCents };
  const base = Math.floor(totalCents / count);
  const last = totalCents - base * (count - 1);
  return { base, last };
}
