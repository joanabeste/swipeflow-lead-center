import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { aggregateEntries, getMonthRange, targetSecondsInRange, countWorkdaysInAbsences } from "@/lib/zeit/reports";
import { scheduleFromProfile, breakModeFromProfile, vacationDaysFromProfile, type Absence } from "@/lib/zeit/types";
import { formatHours } from "@/lib/zeit/format";
import { loadEntriesInRange } from "../../../_components/data-helpers";
import { CalendarMonthView } from "../../../kalender/_components/calendar-month-view";

export default async function MitarbeiterDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const today = new Date();
  const year = sp.year ? parseInt(sp.year, 10) : today.getFullYear();
  const monthOneBased = sp.month ? parseInt(sp.month, 10) : today.getMonth() + 1;
  const month = Math.max(0, Math.min(11, monthOneBased - 1));

  const db = createServiceClient();
  const { data: profile } = await db.from("profiles").select("*").eq("id", id).single<Profile>();
  if (!profile) notFound();

  const { from, to } = getMonthRange(new Date(year, month, 1));
  const { data: rawAbsences } = await db.from("absences").select("*").eq("user_id", id);
  const absences = (rawAbsences ?? []) as Absence[];

  const entries = await loadEntriesInRange(id, from, to);
  const schedule = scheduleFromProfile(profile);
  const breakMode = breakModeFromProfile(profile);
  const aggregate = aggregateEntries(entries, breakMode);
  const target = targetSecondsInRange(schedule, from, to, absences);
  const vacationUsed = countWorkdaysInAbsences(absences, new Date(year, 0, 1), new Date(year + 1, 0, 1));
  const vacationTotal = vacationDaysFromProfile(profile);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{profile.name}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{profile.email} · Rolle: {profile.role}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card label="Gearbeitet (Monat)" value={`${formatHours(aggregate.totalSeconds)} h`} />
        <Card label="Soll" value={`${formatHours(target)} h`} />
        <Card label="Urlaub" value={`${vacationUsed} / ${vacationTotal}`} />
        <Card label="Pause" value={breakMode === "manual" ? "manuell" : "auto"} />
      </div>

      <CalendarMonthView
        year={year}
        month={month}
        entries={entries}
        absences={absences}
        basePath={`/zeit/admin/mitarbeiter/${id}`}
      />
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}
