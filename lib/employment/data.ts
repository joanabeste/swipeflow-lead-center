// Datenzugriff für Arbeitsverträge (Admin-UI). Service-Client, da auch interne
// Aggregationen RLS umgehen dürfen — die Layout-Guard schützt die Route.

import { createServiceClient } from "@/lib/supabase/server";
import type { EmploymentRenderInput } from "./template";
import {
  employeeName,
  type EmploymentContractRow,
  type EmploymentEvent,
  type EmploymentQuestionnaireRow,
} from "./types";

export async function loadEmploymentContracts(): Promise<EmploymentContractRow[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("employment_contracts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[loadEmploymentContracts]", error);
    return [];
  }
  return (data as unknown as EmploymentContractRow[]) ?? [];
}

export async function loadEmploymentContract(id: string): Promise<EmploymentContractRow | null> {
  const db = createServiceClient();
  const { data } = await db.from("employment_contracts").select("*").eq("id", id).maybeSingle();
  return (data as unknown as EmploymentContractRow | null) ?? null;
}

export async function loadEmploymentEvents(id: string): Promise<EmploymentEvent[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("employment_contract_events")
    .select("*")
    .eq("employment_contract_id", id)
    .order("created_at", { ascending: false });
  return (data as unknown as EmploymentEvent[]) ?? [];
}

export async function loadQuestionnaire(contractId: string): Promise<EmploymentQuestionnaireRow | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("employment_questionnaires")
    .select("*")
    .eq("employment_contract_id", contractId)
    .maybeSingle();
  return (data as unknown as EmploymentQuestionnaireRow | null) ?? null;
}

/** Baut das Render-Input aus einer Vertragszeile. */
export function buildEmploymentRenderInput(
  row: EmploymentContractRow,
  opts: {
    mode: "view" | "pdf";
    signature?: { dataUrl: string; signedAt: string; signerName: string } | null;
    providerSignature?: { dataUrl: string } | null;
  },
): EmploymentRenderInput {
  const plzCity = [row.employee_zip, row.employee_city].filter(Boolean).join(" ").trim();
  return {
    mode: opts.mode,
    variant: row.variant,
    employeeName: employeeName(row),
    street: row.employee_street ?? "",
    plzCity,
    startDate: row.start_date ?? "",
    fixedTerm: row.fixed_term,
    endDate: row.end_date ?? "",
    probationMonths: row.probation_months,
    payModel: row.pay_model,
    hourlyWageCents: row.hourly_wage_cents,
    monthlySalaryCents: row.monthly_salary_cents,
    commissionPerAppointmentCents: row.commission_per_appointment_cents,
    weeklyHours: row.weekly_hours,
    workdaysPerWeek: row.workdays_per_week,
    vacationDays: row.vacation_days,
    travelCostReimbursed: row.travel_cost_reimbursed,
    noticePeriodModel: row.notice_period_model,
    signature: opts.signature ?? null,
    providerSignature: opts.providerSignature ?? null,
  };
}
