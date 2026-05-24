import { requireZeitUser } from "@/lib/zeit/auth";
import { loadEntriesInRange, loadOwnAbsences } from "../_components/data-helpers";
import { CalendarMonthView } from "./_components/calendar-month-view";

export default async function ZeitKalenderPage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireZeitUser();
  const today = new Date();
  const year = sp.year ? parseInt(sp.year, 10) : today.getFullYear();
  const monthOneBased = sp.month ? parseInt(sp.month, 10) : today.getMonth() + 1;
  const month = Math.max(0, Math.min(11, monthOneBased - 1));

  const from = new Date(year, month, 1);
  const to = new Date(year, month + 1, 1);
  const [entries, absences] = await Promise.all([
    loadEntriesInRange(ctx.user.id, from, to),
    loadOwnAbsences(ctx.user.id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Kalender</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Monats-Uebersicht mit Eintraegen und Abwesenheiten</p>
      </div>
      <CalendarMonthView year={year} month={month} entries={entries} absences={absences} />
    </div>
  );
}
