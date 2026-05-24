import { createServiceClient } from "@/lib/supabase/server";
import { aggregateEntries, getMonthRange } from "@/lib/zeit/reports";
import { formatHours } from "@/lib/zeit/format";

interface RowDb { id: string; user_id: string; started_at: string; ended_at: string | null; note: string | null; lead_id: string | null; project_id: string | null; created_at: string; updated_at: string; }

export async function ZeitTab({ leadId }: { leadId: string }) {
  const db = createServiceClient();
  const month = getMonthRange();
  const [{ data: entries, error }, { data: monthData }] = await Promise.all([
    db.from("time_entries").select("*").eq("lead_id", leadId).order("started_at", { ascending: false }).limit(200),
    db.from("time_entries").select("*").eq("lead_id", leadId).gte("started_at", month.from.toISOString()).lt("started_at", month.to.toISOString()),
  ]);

  if (error && (error.code === "42P01" || /relation.*does not exist|column.*does not exist/i.test(error.message))) {
    return (
      <p className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        Zeit-Modul oder Lead-Verknuepfung fehlt. Migrationen 062–064 (Zeit) und 071 (lifecycle_stage) muessen ausgefuehrt sein.
      </p>
    );
  }

  const all = (entries ?? []) as RowDb[];
  const monthEntries = (monthData ?? []) as RowDb[];
  const totalAll = all.filter((e) => e.ended_at).reduce((acc, e) => acc + Math.max(0, Math.round((new Date(e.ended_at!).getTime() - new Date(e.started_at).getTime()) / 1000)), 0);
  const monthAgg = aggregateEntries(monthEntries);

  if (all.length === 0) {
    return <p className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400 dark:border-[#2c2c2e]/60">Noch keine Zeiteintraege auf diesen Kunden gebucht.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Gesamt" value={`${formatHours(totalAll)} h`} />
        <Stat label="Dieser Monat" value={`${formatHours(monthAgg.totalSeconds)} h`} />
        <Stat label="Eintraege" value={`${all.length}`} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 dark:bg-[#1c1c1e]">
            <tr>
              <th className="px-4 py-3 text-left">Datum</th>
              <th className="px-4 py-3 text-left">Dauer</th>
              <th className="px-4 py-3 text-left">Notiz</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-[#2c2c2e]/40">
            {all.slice(0, 20).map((e) => {
              const seconds = e.ended_at ? Math.max(0, Math.round((new Date(e.ended_at).getTime() - new Date(e.started_at).getTime()) / 1000)) : 0;
              return (
                <tr key={e.id}>
                  <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{new Date(e.started_at).toLocaleDateString("de-DE")}</td>
                  <td className="px-4 py-2 font-mono text-gray-900 dark:text-white">{e.ended_at ? `${formatHours(seconds)} h` : "laeuft"}</td>
                  <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{e.note ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 px-3 py-2 dark:border-[#2c2c2e]/40">
      <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-0.5 text-xl font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}
