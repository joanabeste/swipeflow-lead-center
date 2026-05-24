// NRW-Feiertage, portiert aus Swipeflow Time Tracking.
// Berechnung deterministisch (Gauss'sche Osterformel) — keine API noetig.

export interface Holiday {
  date: string;
  name: string;
}

function computeEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const cache = new Map<number, Holiday[]>();

export function getNrwHolidays(year: number): Holiday[] {
  const cached = cache.get(year);
  if (cached) return cached;
  const easter = computeEaster(year);
  const list: Holiday[] = [
    { date: `${year}-01-01`, name: "Neujahr" },
    { date: dateKey(addDays(easter, -2)), name: "Karfreitag" },
    { date: dateKey(addDays(easter, 1)), name: "Ostermontag" },
    { date: `${year}-05-01`, name: "Tag der Arbeit" },
    { date: dateKey(addDays(easter, 39)), name: "Christi Himmelfahrt" },
    { date: dateKey(addDays(easter, 50)), name: "Pfingstmontag" },
    { date: dateKey(addDays(easter, 60)), name: "Fronleichnam" },
    { date: `${year}-10-03`, name: "Tag der Deutschen Einheit" },
    { date: `${year}-11-01`, name: "Allerheiligen" },
    { date: `${year}-12-25`, name: "1. Weihnachtstag" },
    { date: `${year}-12-26`, name: "2. Weihnachtstag" },
  ];
  cache.set(year, list);
  return list;
}

export function getHolidaysInRange(from: Date, to: Date): Map<string, string> {
  const result = new Map<string, string>();
  const startYear = from.getFullYear();
  const endYear = new Date(to.getTime() - 1).getFullYear();
  for (let y = startYear; y <= endYear; y++) {
    for (const h of getNrwHolidays(y)) {
      const d = new Date(h.date + "T00:00:00");
      if (d >= from && d < to) result.set(h.date, h.name);
    }
  }
  return result;
}

export function countBusinessDays(from: Date, to: Date): number {
  const holidays = getHolidaysInRange(from, to);
  let days = 0;
  for (const d = new Date(from); d < to; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    if (holidays.has(dateKey(d))) continue;
    days += 1;
  }
  return days;
}
