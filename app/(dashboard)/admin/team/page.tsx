import Link from "next/link";
import { Users, Coins, UserPlus } from "lucide-react";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { UserManager } from "../../nutzer/user-manager";
import { aggregateEntries, getMonthRange } from "@/lib/zeit/reports";
import { breakModeFromProfile, type Absence } from "@/lib/zeit/types";
import { formatHours } from "@/lib/zeit/format";
import { permissionsFromProfile, type Profile } from "@/lib/types";

function fmtMoney(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

type CommissionEvent = { user_id: string; amount_cents: number };

export default async function AdminTeamPage() {
  const db = createServiceClient();
  const sb = await createClient();
  const { data: { user: currentUser } } = await sb.auth.getUser();
  const range = getMonthRange();
  const monthLabel = range.from.toLocaleDateString("de-DE", { month: "long", year: "numeric" });

  // Alle aktiven Profile.
  const { data: profileData } = await db
    .from("profiles")
    .select("id, name, email, role, status, hourly_wage_cents, wage_currency, hours_mon, hours_tue, hours_wed, hours_thu, hours_fri, hours_sat, hours_sun, can_vertrieb, can_fulfillment, can_zeit, break_mode")
    .order("name", { ascending: true });
  const profiles = (profileData ?? []) as Profile[];

  // Zeit-Eintraege des Monats.
  const { data: entriesData, error: entriesErr } = await db
    .from("time_entries")
    .select("user_id, started_at, ended_at, note, id, lead_id, created_at, updated_at")
    .gte("started_at", range.from.toISOString())
    .lt("started_at", range.to.toISOString());
  const entries = (entriesData ?? []) as Array<{ user_id: string; started_at: string; ended_at: string | null; note: string | null; id: string; lead_id: string | null; created_at: string; updated_at: string }>;
  const entriesByUser = new Map<string, typeof entries>();
  for (const e of entries) {
    const list = entriesByUser.get(e.user_id) ?? [];
    list.push(e);
    entriesByUser.set(e.user_id, list);
  }

  // Approved Abwesenheiten (fuer akkuratere Aggregate falls noetig).
  const { data: absencesData } = await db
    .from("absences")
    .select("*")
    .eq("status", "approved")
    .gte("date_from", range.from.toISOString().slice(0, 10));
  const absences = (absencesData ?? []) as Absence[];
  const absencesByUser = new Map<string, Absence[]>();
  for (const a of absences) {
    const list = absencesByUser.get(a.user_id) ?? [];
    list.push(a);
    absencesByUser.set(a.user_id, list);
  }

  // Provisions-Events des Monats.
  const { data: commData } = await db
    .from("commission_events")
    .select("user_id, amount_cents")
    .gte("earned_at", range.from.toISOString())
    .lt("earned_at", range.to.toISOString());
  const commByUser = new Map<string, number>();
  for (const e of (commData ?? []) as CommissionEvent[]) {
    commByUser.set(e.user_id, (commByUser.get(e.user_id) ?? 0) + e.amount_cents);
  }

  const rows = profiles.map((p) => {
    const userEntries = entriesByUser.get(p.id) ?? [];
    const aggregate = aggregateEntries(userEntries, breakModeFromProfile(p));
    const workedSeconds = aggregate.totalSeconds;
    const wageCents = Math.round((workedSeconds / 3600) * (p.hourly_wage_cents ?? 0));
    const commissionCents = commByUser.get(p.id) ?? 0;
    const totalCents = wageCents + commissionCents;
    const perms = permissionsFromProfile(p);
    return { p, workedSeconds, wageCents, commissionCents, totalCents, perms };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      worked: acc.worked + r.workedSeconds,
      wage: acc.wage + r.wageCents,
      commission: acc.commission + r.commissionCents,
      total: acc.total + r.totalCents,
    }),
    { worked: 0, wage: 0, commission: 0, total: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Team-Uebersicht</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Alle Mitarbeiter im Blick — {monthLabel}. Stunden, Provisionen, Auszahlung, Berechtigungen.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/einstellungen/provisionen" className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-[#2c2c2e]/60 dark:hover:bg-white/5">
            <Coins className="h-3.5 w-3.5" /> Provisions-Regeln
          </Link>
          <a href="#nutzer-verwalten" className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark">
            <UserPlus className="h-3.5 w-3.5" /> Nutzer anlegen
          </a>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="Mitarbeiter" value={`${profiles.length}`} />
        <Kpi label="Stunden gesamt" value={`${formatHours(totals.worked)} h`} />
        <Kpi label="Provisionen gesamt" value={fmtMoney(totals.commission)} />
        <Kpi label="Auszahlung gesamt" value={fmtMoney(totals.total)} highlight />
      </div>

      {entriesErr && (entriesErr.code === "42P01" || /relation.*does not exist/i.test(entriesErr.message)) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Timetracking-Modul ist noch nicht migriert (062–064). Stunden bleiben 0.
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 dark:bg-[#1c1c1e]">
            <tr>
              <th className="px-4 py-3 text-left">Mitarbeiter</th>
              <th className="px-4 py-3 text-left">Rolle</th>
              <th className="px-4 py-3 text-center">Bereiche</th>
              <th className="px-4 py-3 text-right">Stundenlohn</th>
              <th className="px-4 py-3 text-right">Stunden</th>
              <th className="px-4 py-3 text-right">Lohn</th>
              <th className="px-4 py-3 text-right">Provision</th>
              <th className="px-4 py-3 text-right">Auszahlung</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-[#2c2c2e]/40">
            {rows.map(({ p, workedSeconds, wageCents, commissionCents, totalCents, perms }) => (
              <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900 dark:text-white">{p.name || "—"}</p>
                  <p className="text-[11px] text-gray-400">{p.email}</p>
                </td>
                <td className="px-4 py-3 text-xs uppercase tracking-wider text-gray-500">{p.role}</td>
                <td className="px-4 py-3 text-center text-[10px] font-mono">
                  <span className={perms.can_vertrieb ? "text-primary" : "text-gray-300"}>V</span>{" · "}
                  <span className={perms.can_fulfillment ? "text-primary" : "text-gray-300"}>F</span>{" · "}
                  <span className={perms.can_zeit ? "text-primary" : "text-gray-300"}>Z</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-300">
                  {p.hourly_wage_cents ? `${fmtMoney(p.hourly_wage_cents)}/h` : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">{formatHours(workedSeconds)} h</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-200">{fmtMoney(wageCents)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-200">{fmtMoney(commissionCents)}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-primary">{fmtMoney(totalCents)}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/zeit/provision?user=${p.id}`} className="text-xs font-medium text-primary hover:underline">Details</Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={9} className="p-8 text-center text-sm text-gray-400">Keine Mitarbeiter gefunden.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-gray-400">
        <Users className="mr-1 inline-block h-3 w-3" /> Bereiche-Spalte: V=Vertrieb · F=Fulfillment · Z=Timetracking. Admins haben implizit alle.
      </p>

      <section id="nutzer-verwalten" className="scroll-mt-20">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">Nutzer-Verwaltung</h2>
        <UserManager profiles={profiles} currentUserId={currentUser?.id ?? ""} />
      </section>
    </div>
  );
}

function Kpi({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${highlight ? "border-primary/30 bg-primary/5" : "border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#161618]"}`}>
      <p className={`text-xs font-medium uppercase tracking-wider ${highlight ? "text-primary/80" : "text-gray-400"}`}>{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${highlight ? "text-primary" : "text-gray-900 dark:text-white"}`}>{value}</p>
    </div>
  );
}
