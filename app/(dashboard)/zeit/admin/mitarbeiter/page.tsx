import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { ProfileEditorRow } from "./_components/profile-editor";
import { DEFAULT_BREAK_MODE, DEFAULT_SCHEDULE, DEFAULT_VACATION_DAYS } from "@/lib/zeit/types";
import type { Profile } from "@/lib/types";

export default async function AdminMitarbeiterPage() {
  const db = createServiceClient();
  const { data, error } = await db
    .from("profiles")
    .select("id, email, name, role, hours_mon, hours_tue, hours_wed, hours_thu, hours_fri, hours_sat, hours_sun, vacation_days_per_year, break_mode")
    .order("name", { ascending: true });

  const profiles = (data ?? []) as Array<Pick<Profile,
    "id" | "email" | "name" | "role" | "hours_mon" | "hours_tue" | "hours_wed" | "hours_thu" | "hours_fri" | "hours_sat" | "hours_sun" | "vacation_days_per_year" | "break_mode"
  >>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Mitarbeiter (Zeit)</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Tageszeitplan, Urlaubsanspruch und Pausen-Modus. Invite/Loeschen erfolgt unter{" "}
          <Link href="/nutzer" className="text-primary hover:underline">/nutzer</Link>.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.code === "42P01" || /relation.*does not exist/i.test(error.message)
            ? "Zeit-Modul nicht migriert — fuehre Migrationen 062–064 in Supabase aus, bevor du Profile bearbeitest."
            : `Fehler: ${error.message}`}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 dark:bg-[#1c1c1e]">
            <tr>
              <th className="px-3 py-3 text-left">Mitarbeiter</th>
              <th className="px-3 py-3 text-left">Rolle</th>
              <th className="px-1 py-3 text-center">Mo</th>
              <th className="px-1 py-3 text-center">Di</th>
              <th className="px-1 py-3 text-center">Mi</th>
              <th className="px-1 py-3 text-center">Do</th>
              <th className="px-1 py-3 text-center">Fr</th>
              <th className="px-1 py-3 text-center">Sa</th>
              <th className="px-1 py-3 text-center">So</th>
              <th className="px-3 py-3 text-center">Urlaub</th>
              <th className="px-3 py-3 text-left">Pause</th>
              <th className="px-3 py-3 text-right">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <ProfileEditorRow
                key={p.id}
                row={{
                  id: p.id,
                  name: p.name ?? "",
                  email: p.email,
                  role: p.role,
                  hours_mon: numOr(p.hours_mon, DEFAULT_SCHEDULE.mon),
                  hours_tue: numOr(p.hours_tue, DEFAULT_SCHEDULE.tue),
                  hours_wed: numOr(p.hours_wed, DEFAULT_SCHEDULE.wed),
                  hours_thu: numOr(p.hours_thu, DEFAULT_SCHEDULE.thu),
                  hours_fri: numOr(p.hours_fri, DEFAULT_SCHEDULE.fri),
                  hours_sat: numOr(p.hours_sat, DEFAULT_SCHEDULE.sat),
                  hours_sun: numOr(p.hours_sun, DEFAULT_SCHEDULE.sun),
                  vacation_days_per_year: numOr(p.vacation_days_per_year, DEFAULT_VACATION_DAYS),
                  break_mode: p.break_mode ?? DEFAULT_BREAK_MODE,
                }}
              />
            ))}
            {profiles.length === 0 && !error && (
              <tr><td colSpan={12} className="p-8 text-center text-sm text-gray-400">Keine Profile gefunden.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function numOr(v: number | null | undefined, fallback: number): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : fallback;
}
