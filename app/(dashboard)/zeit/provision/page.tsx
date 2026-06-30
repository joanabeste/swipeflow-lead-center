import Link from "next/link";
import { Coins, ExternalLink } from "lucide-react";
import { requireZeitUser } from "@/lib/zeit/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { aggregateEntries, getMonthRange } from "@/lib/zeit/reports";
import { breakModeFromProfile } from "@/lib/zeit/types";
import { formatHours } from "@/lib/zeit/format";
import { loadEntriesInRange } from "../_components/data-helpers";

interface SearchParams {
  month?: string; // YYYY-MM
  user?: string;
}

function parseMonthParam(s: string | undefined): Date {
  if (!s) return new Date();
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return new Date();
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, 1);
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(d: Date, delta: number): string {
  return monthKey(new Date(d.getFullYear(), d.getMonth() + delta, 1));
}

function fmtMoney(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export default async function ProvisionPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const ctx = await requireZeitUser();
  const isAdmin = ctx.profile.role === "admin";
  // Server-Gate: ?user=-Param wird nur fuer Admins beachtet. Non-Admins werden
  // mit ?user=fremdeId auf ihre eigene Sicht umgeleitet (kein silent fallback).
  if (!isAdmin && sp.user && sp.user !== ctx.user.id) {
    const { redirect } = await import("next/navigation");
    redirect(`/zeit/provision${sp.month ? `?month=${sp.month}` : ""}`);
  }
  const targetUserId = isAdmin && sp.user ? sp.user : ctx.user.id;
  const monthDate = parseMonthParam(sp.month);
  const range = getMonthRange(monthDate);

  const db = createServiceClient();

  const [{ data: targetProfile }, entries, eventsRes, otherProfilesRes] = await Promise.all([
    db
      .from("profiles")
      .select("id, name, email, hourly_wage_cents, wage_currency")
      .eq("id", targetUserId)
      .single<{ id: string; name: string; email: string; hourly_wage_cents: number | null; wage_currency: string | null }>(),
    loadEntriesInRange(targetUserId, range.from, range.to),
    db
      .from("commission_events")
      .select("id, amount_cents, currency, earned_at, lead_id, rule_id, confirmed_at, payout_at, attributed_at, leads(company_name), commission_rules(name)")
      .eq("user_id", targetUserId)
      .is("voided_at", null) // stornierte Provisionen zaehlen nicht zur Auszahlung
      .gte("attributed_at", range.from.toISOString())
      .lt("attributed_at", range.to.toISOString())
      .order("attributed_at", { ascending: false }),
    isAdmin
      ? db.from("profiles").select("id, name, email").eq("status", "active").order("name", { ascending: true })
      : Promise.resolve({ data: null } as { data: null }),
  ]);

  const breakMode = breakModeFromProfile(ctx.profile);
  const aggregate = aggregateEntries(entries, breakMode);
  const workedSeconds = aggregate.totalSeconds;
  const hourlyCents = targetProfile?.hourly_wage_cents ?? 0;
  const wageCents = Math.round((workedSeconds / 3600) * hourlyCents);

  type EventRow = {
    id: string;
    amount_cents: number;
    currency: string;
    earned_at: string;
    lead_id: string;
    rule_id: string;
    confirmed_at: string | null;
    payout_at: string | null;
    leads: { company_name: string } | null;
    commission_rules: { name: string } | null;
  };
  // Fallback, falls Migration 069/070/071 (voided_at/confirmed_at/attributed_at)
  // noch nicht eingespielt sind: ohne diese Spalten/Filter erneut laden (Filter dann
  // auf earned_at), statt zu brechen → es gilt alles als "voraussichtlich".
  let evData: unknown[] | null = eventsRes.data;
  let evErr = eventsRes.error;
  if (evErr && /column .*(voided_at|confirmed_at|attributed_at|payout_at).* does not exist/i.test(evErr.message)) {
    const retry = await db
      .from("commission_events")
      .select("id, amount_cents, currency, earned_at, lead_id, rule_id, leads(company_name), commission_rules(name)")
      .eq("user_id", targetUserId)
      .gte("earned_at", range.from.toISOString())
      .lt("earned_at", range.to.toISOString())
      .order("earned_at", { ascending: false });
    evData = retry.data;
    evErr = retry.error;
  }
  const tableMissing = evErr && /relation.*does not exist/i.test(evErr.message);
  if (evErr && !tableMissing) {
    console.error("[provision] commission_events query failed:", evErr);
  }
  const events = ((evData ?? []) as unknown as EventRow[]) ?? [];
  // Voraussichtlich = gebucht, aber noch nicht vom Admin bestaetigt.
  const prospectiveCents = events
    .filter((e) => !e.confirmed_at)
    .reduce((sum, e) => sum + e.amount_cents, 0);
  const confirmedCents = events
    .filter((e) => e.confirmed_at)
    .reduce((sum, e) => sum + e.amount_cents, 0);

  const currentMonth = monthKey(monthDate);
  const prevMonth = shiftMonth(monthDate, -1);
  const nextMonth = shiftMonth(monthDate, 1);
  const monthLabel = monthDate.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  const otherProfiles =
    (otherProfilesRes?.data as Array<{ id: string; name: string; email: string }> | null) ?? [];

  function buildHref(next: { month?: string; user?: string }) {
    const params = new URLSearchParams();
    params.set("month", next.month ?? currentMonth);
    if (next.user) params.set("user", next.user);
    else if (sp.user) params.set("user", sp.user);
    return `/zeit/provision?${params.toString()}`;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-gray-900 dark:text-white">
          <Coins className="h-6 w-6 text-primary" />
          Provision & Auszahlung
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Deine Provisionen im gewählten Monat — voraussichtlich und vom Admin bestätigt.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-[#2c2c2e]/60 dark:bg-[#161618]">
          <Link
            href={buildHref({ month: prevMonth })}
            className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
          >
            ←
          </Link>
          <span className="border-x border-gray-200 px-4 py-2 text-sm font-medium dark:border-[#2c2c2e]/60">
            {monthLabel}
          </span>
          <Link
            href={buildHref({ month: nextMonth })}
            className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
          >
            →
          </Link>
        </div>
        {isAdmin && (
          <form className="flex items-center gap-2">
            <input type="hidden" name="month" value={currentMonth} />
            <label className="text-xs text-gray-500">Mitarbeiter:</label>
            <select
              name="user"
              defaultValue={targetUserId}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#232325]"
            >
              <option value={ctx.user.id}>Ich</option>
              {otherProfiles
                .filter((p) => p.id !== ctx.user.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.email}
                  </option>
                ))}
            </select>
            <button
              type="submit"
              formMethod="get"
              formAction="/zeit/provision"
              className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white dark:bg-white dark:text-gray-900"
            >
              Anzeigen
            </button>
          </form>
        )}
      </div>

      {/* Provision im Fokus: voraussichtlich vs. bestätigt */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-amber-300/50 bg-amber-50 p-5 dark:border-amber-400/20 dark:bg-amber-400/5">
          <p className="text-xs uppercase tracking-wider text-amber-700/80 dark:text-amber-400/80">
            Voraussichtliche Provision
          </p>
          <p className="mt-1 text-3xl font-bold text-amber-700 dark:text-amber-300">
            {fmtMoney(prospectiveCents)}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Gebucht, aber noch nicht vom Admin bestätigt.
          </p>
        </div>
        <div className="rounded-2xl border border-green-300/50 bg-green-50 p-5 dark:border-green-400/20 dark:bg-green-400/5">
          <p className="text-xs uppercase tracking-wider text-green-700/80 dark:text-green-400/80">
            Bestätigte Provision
          </p>
          <p className="mt-1 text-3xl font-bold text-green-700 dark:text-green-300">
            {fmtMoney(confirmedCents)}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Vom Admin bestätigt · {targetProfile?.name || targetProfile?.email} · {monthLabel}
          </p>
        </div>
      </div>

      {/* Lohn/Stunden nur als kleine KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Stundenlohn"
          value={hourlyCents > 0 ? fmtMoney(hourlyCents) + "/h" : "—"}
          sub={hourlyCents === 0 ? "Vom Admin pflegbar in Einstellungen → Provisionen & Lohn" : null}
        />
        <KpiCard
          label="Stunden im Monat"
          value={`${formatHours(workedSeconds)} h`}
          sub={`${entries.length} Einträge`}
        />
        <KpiCard label="Lohn (Std × Lohn)" value={fmtMoney(wageCents)} />
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
        <header className="border-b border-gray-100 px-5 py-3 dark:border-[#2c2c2e]/40">
          <h2 className="text-sm font-semibold">Provisions-Events</h2>
        </header>
        {tableMissing ? (
          <p className="px-5 py-6 text-sm text-gray-400">
            Tabelle commission_events fehlt — Migration 068 muss in Supabase ausgeführt werden.
          </p>
        ) : events.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-400">Keine Provisionen in diesem Monat.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 dark:bg-[#1c1c1e]">
              <tr>
                <th className="px-4 py-2 text-left">Datum</th>
                <th className="px-4 py-2 text-left">Lead</th>
                <th className="px-4 py-2 text-left">Regel</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-right">Betrag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-[#2c2c2e]/40">
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-2 text-gray-600 dark:text-gray-300">
                    {new Date(e.earned_at).toLocaleDateString("de-DE", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/crm/${e.lead_id}`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      {e.leads?.company_name ?? e.lead_id.slice(0, 8)}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-gray-600 dark:text-gray-300">
                    {e.commission_rules?.name ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    {e.confirmed_at ? (
                      <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300">
                        Bestätigt
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                        Voraussichtlich
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">
                    {fmtMoney(e.amount_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/60 dark:bg-[#161618]">
      <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-400">{sub}</p>}
    </div>
  );
}
