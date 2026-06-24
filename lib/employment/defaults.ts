// Variant-Defaults für das Arbeitsvertrags-Formular. Werte spiegeln die beiden
// Muster-Verträge (Werkstudent 15 €/Std, Angestellter 2.100 €/Monat).

import type { EmploymentVariant } from "./types";

export interface EmploymentTermsState {
  payModel: "hourly" | "monthly";
  hourlyEur: string;
  monthlyEur: string;
  commissionEur: string;
  weeklyHours: string;
  workdaysPerWeek: string;
  vacationDays: string;
  probationMonths: string;
  startDate: string; // ISO (YYYY-MM-DD)
  fixedTerm: boolean;
  endDate: string;
  travelCostReimbursed: boolean;
  noticePeriodModel: "gesetzlich" | "monat_zum_monatsende";
}

export const WERKSTUDENT_DEFAULTS: EmploymentTermsState = {
  payModel: "hourly",
  hourlyEur: "15",
  monthlyEur: "0",
  commissionEur: "40",
  weeklyHours: "10",
  workdaysPerWeek: "2",
  vacationDays: "8",
  probationMonths: "3",
  startDate: "",
  fixedTerm: false,
  endDate: "",
  travelCostReimbursed: false,
  noticePeriodModel: "gesetzlich",
};

export const ANGESTELLTER_DEFAULTS: EmploymentTermsState = {
  payModel: "monthly",
  hourlyEur: "0",
  monthlyEur: "2100",
  commissionEur: "50",
  weeklyHours: "30",
  workdaysPerWeek: "5",
  vacationDays: "28",
  probationMonths: "3",
  startDate: "",
  fixedTerm: false,
  endDate: "",
  travelCostReimbursed: true,
  noticePeriodModel: "monat_zum_monatsende",
};

export function defaultsFor(variant: EmploymentVariant): EmploymentTermsState {
  return variant === "werkstudent" ? WERKSTUDENT_DEFAULTS : ANGESTELLTER_DEFAULTS;
}
