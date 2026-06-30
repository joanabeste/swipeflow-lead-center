import { Coins } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getMonthRange } from "@/lib/zeit/reports";
import type { CommissionRule, CustomLeadStatus, Profile } from "@/lib/types";
import { ProvisionenManager } from "../../einstellungen/provisionen/provisionen-manager";
import { CommissionLedger, type LedgerEvent } from "./commission-ledger";

interface SearchParams {
  month?: string; // YYYY-MM
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

export default async function AdminProvisionenPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const db = createServiceClient();

  const sp = await searchParams;
  const monthDate = parseMonthParam(sp.month);
  const range = getMonthRange(monthDate);

  const [{ data: rulesData }, { data: statusesData }, { data: profilesData }, eventsRes] =
    await Promise.all([
      db.from("commission_rules").select("*").order("created_at", { ascending: false }),
      db
        .from("custom_lead_statuses")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true }),
      db
        .from("profiles")
        .select("id, name, email, role, hourly_wage_cents")
        .eq("status", "active")
        .order("name", { ascending: true }),
      db
        .from("commission_events")
        .select(
          "id, amount_cents, currency, earned_at, voided_at, void_reason, rule_id, lead_id, user_id, note, leads(company_name), profiles:user_id(name, email), commission_rules(name)",
        )
        .gte("earned_at", range.from.toISOString())
        .lt("earned_at", range.to.toISOString())
        .order("earned_at", { ascending: false }),
    ]);

  const tableMissing =
    !!eventsRes.error && /relation .* does not exist|column .* does not exist/i.test(eventsRes.error.message);
  if (eventsRes.error && !tableMissing) {
    console.error("[admin/provisionen] commission_events query failed:", eventsRes.error);
  }
  const events = ((eventsRes.data ?? []) as unknown as LedgerEvent[]) ?? [];

  const profiles =
    (profilesData as Pick<Profile, "id" | "name" | "email" | "role" | "hourly_wage_cents">[]) ?? [];

  const nav = {
    currentMonth: monthKey(monthDate),
    prevMonth: shiftMonth(monthDate, -1),
    nextMonth: shiftMonth(monthDate, 1),
    monthLabel: monthDate.toLocaleDateString("de-DE", { month: "long", year: "numeric" }),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-gray-900 dark:text-white">
          <Coins className="h-6 w-6 text-primary" />
          Provisionen & Loehne
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Lege Provisions-Regeln fest (Trigger-Status, Betrag, Empfaenger), pflege die Stundenloehne
          und verwalte die gebuchten Provisionen.
        </p>
      </div>

      <CommissionLedger
        events={events}
        profiles={profiles.map((p) => ({ id: p.id, name: p.name, email: p.email }))}
        nav={nav}
        tableMissing={tableMissing}
      />

      <ProvisionenManager
        rules={(rulesData as CommissionRule[]) ?? []}
        statuses={(statusesData as CustomLeadStatus[]) ?? []}
        profiles={profiles}
      />
    </div>
  );
}
