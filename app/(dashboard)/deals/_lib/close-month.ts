// Abschluss-Monat-Helfer: das Deal-Feld wählt nur einen MONAT; gespeichert wird
// der 15. dieses Monats als `actual_close_date`. Der 15. (Tagesmitte) vermeidet
// Zeitzonen-Verschiebungen, falls das Datum irgendwo mit `new Date()` gerendert
// wird — der Monat bleibt so immer korrekt. Zählt damit sauber in den
// monatlichen Sales-Report (Closings nach `actual_close_date`).

const MONTHS_BACK = 12;
const MONTHS_FWD = 12;

/** `"2026-06-15"` → `"2026-06"` (Dropdown-Wert). `null`/leer → `""`. */
export function dateToMonthValue(dateOnly: string | null | undefined): string {
  if (!dateOnly) return "";
  return dateOnly.slice(0, 7);
}

/** `"2026-06"` → `"2026-06-15"` (gespeichertes `actual_close_date`). Leer → `null`. */
export function monthValueToDate(monthValue: string): string | null {
  if (!monthValue) return null;
  return `${monthValue}-15`;
}

/** `"2026-06"` → `"Juni 2026"`. Ungültig/leer → `"—"`. */
export function closeMonthLabel(monthValue: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthValue);
  if (!m) return "—";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 15));
  return d.toLocaleDateString("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * Monatsoptionen fürs Dropdown (neuester zuerst): 12 Monate zurück bis 12 voraus.
 * `ensure` fügt einen außerhalb des Fensters liegenden Bestandswert hinzu, damit
 * ein bereits gesetztes Datum (z. B. alter Deal) nicht aus dem Dropdown fällt.
 */
export function closeMonthOptions(ensure?: string): { value: string; label: string }[] {
  const now = new Date();
  const seen = new Set<string>();
  const opts: { value: string; label: string }[] = [];
  for (let i = MONTHS_FWD; i >= -MONTHS_BACK; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    seen.add(value);
    opts.push({ value, label: closeMonthLabel(value) });
  }
  if (ensure && /^\d{4}-\d{2}$/.test(ensure) && !seen.has(ensure)) {
    opts.push({ value: ensure, label: closeMonthLabel(ensure) });
    opts.sort((a, b) => (a.value < b.value ? 1 : -1)); // neuester zuerst
  }
  return opts;
}
