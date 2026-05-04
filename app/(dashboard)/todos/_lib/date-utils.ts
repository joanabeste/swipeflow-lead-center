/** Datum-Helfer für Todo-Liste — alle YYYY-MM-DD-Strings, lokal-konsistent. */

export function todayKey(): string {
  return toIsoDate(new Date());
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(a) - Date.parse(b)) / 86400_000);
}

export type DueBucket = "overdue" | "today" | "tomorrow" | "this_week" | "later" | "done_today" | "done_earlier";

export function bucketOf(due: string, doneAt: string | null, today: string): DueBucket {
  if (doneAt) {
    return doneAt.slice(0, 10) === today ? "done_today" : "done_earlier";
  }
  const delta = diffDays(due, today);
  if (delta < 0) return "overdue";
  if (delta === 0) return "today";
  if (delta === 1) return "tomorrow";
  if (delta <= 7) return "this_week";
  return "later";
}

export function relativeDueLabel(due: string, today: string): { text: string; tone: "overdue" | "today" | "soon" | "later" } {
  const delta = diffDays(due, today);
  if (delta < 0) {
    const d = -delta;
    return { text: d === 1 ? "Gestern" : `${d} Tage überfällig`, tone: "overdue" };
  }
  if (delta === 0) return { text: "Heute", tone: "today" };
  if (delta === 1) return { text: "Morgen", tone: "soon" };
  if (delta <= 7) return { text: `In ${delta} Tagen`, tone: "soon" };
  // Anzeige als TT.MM.JJJJ
  const [y, m, d] = due.split("-");
  return { text: `${d}.${m}.${y}`, tone: "later" };
}

/**
 * Smart-Parser für Quick-Add-Input. Erkennt Datums-Hinweise am Ende des Texts
 * und gibt Titel + Datum getrennt zurück. Beispiele:
 *   „Anrufen morgen"          → { title: "Anrufen", date: <morgen> }
 *   „Demo Freitag"            → { title: "Demo", date: <nächster Freitag> }
 *   „Follow-up in 3 Tagen"    → { title: "Follow-up", date: heute+3 }
 *   „Angebot 22.05."          → { title: "Angebot", date: 2026-05-22 }
 *   „Anruf"                   → { title: "Anruf", date: heute }
 */
export function parseQuickAddInput(input: string): { title: string; date: string } {
  const text = input.trim();
  const today = todayKey();
  if (!text) return { title: "", date: today };

  // Pattern 1: „... in N Tagen / in N Wochen"
  const inDays = text.match(/^(.+?)\s+in\s+(\d{1,3})\s+(tag|tagen|woche|wochen)\s*$/i);
  if (inDays) {
    const n = parseInt(inDays[2], 10);
    const unit = inDays[3].toLowerCase();
    const days = unit.startsWith("woche") ? n * 7 : n;
    return { title: inDays[1].trim(), date: addDays(today, days) };
  }

  // Pattern 2: „... heute / morgen / übermorgen"
  const relSimple = text.match(/^(.+?)\s+(heute|morgen|uebermorgen|übermorgen)\s*$/i);
  if (relSimple) {
    const word = relSimple[2].toLowerCase();
    const days = word === "heute" ? 0 : word === "morgen" ? 1 : 2;
    return { title: relSimple[1].trim(), date: addDays(today, days) };
  }

  // Pattern 3: „... <Wochentag>" (nächstes Vorkommen, oder heute wenn heute)
  const weekdayMatch = text.match(/^(.+?)\s+(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\s*$/i);
  if (weekdayMatch) {
    const target = ["sonntag", "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag"].indexOf(weekdayMatch[2].toLowerCase());
    const todayDate = new Date();
    const todayDow = todayDate.getDay();
    let delta = (target - todayDow + 7) % 7;
    if (delta === 0) delta = 7; // „Freitag" = nächster Freitag, nicht heute
    return { title: weekdayMatch[1].trim(), date: addDays(today, delta) };
  }

  // Pattern 4: „... TT.MM." oder „... TT.MM.JJJJ"
  const explicit = text.match(/^(.+?)\s+(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?\s*$/);
  if (explicit) {
    const day = parseInt(explicit[2], 10);
    const month = parseInt(explicit[3], 10);
    const yearRaw = explicit[4];
    let year: number;
    if (yearRaw) {
      year = yearRaw.length === 2 ? 2000 + parseInt(yearRaw, 10) : parseInt(yearRaw, 10);
    } else {
      const todayDate = new Date();
      year = todayDate.getFullYear();
      // Wenn das Datum bereits in der Vergangenheit liegt, ins nächste Jahr
      const candidate = new Date(year, month - 1, day);
      if (candidate < todayDate && diffDays(toIsoDate(candidate), today) < 0) {
        year++;
      }
    }
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return { title: explicit[1].trim(), date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
    }
  }

  // Default: heute
  return { title: text, date: today };
}
