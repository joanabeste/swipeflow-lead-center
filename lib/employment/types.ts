// Typen für Arbeitsverträge (Werkstudent / Angestellter) + Personalfragebogen.
// Status-Lebenszyklus identisch zu Kundenverträgen (siehe lib/contracts/types.ts).

import type { ContractStatus } from "@/lib/contracts/types";

export type { ContractStatus };

export type EmploymentVariant = "werkstudent" | "angestellter";
export type PayModel = "hourly" | "monthly";
export type NoticePeriodModel = "gesetzlich" | "monat_zum_monatsende";
export type QuestionnaireStatus = "pending" | "submitted";

export type EmploymentEventType =
  | "created"
  | "sent"
  | "viewed"
  | "signed"
  | "downloaded"
  | "resent"
  | "extended"
  | "cancelled"
  | "questionnaire_submitted";

export interface EmploymentContractRow {
  id: string;
  variant: EmploymentVariant;
  status: ContractStatus;
  token: string | null;

  employee_first_name: string | null;
  employee_last_name: string | null;
  employee_street: string | null;
  employee_zip: string | null;
  employee_city: string | null;
  employee_email: string | null;

  start_date: string | null;
  fixed_term: boolean;
  end_date: string | null;
  probation_months: number;

  pay_model: PayModel;
  hourly_wage_cents: number;
  monthly_salary_cents: number;
  commission_per_appointment_cents: number;

  weekly_hours: number;
  workdays_per_week: number;
  vacation_days: number;

  travel_cost_reimbursed: boolean;
  notice_period_model: NoticePeriodModel;

  signature_path: string | null;
  pdf_path: string | null;
  terms_snapshot: Record<string, unknown> | null;

  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  expires_at: string | null;

  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmploymentEvent {
  id: string;
  employment_contract_id: string;
  event: EmploymentEventType;
  actor_user_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

/** Strukturierte (unkritische) Personalfragebogen-Daten im jsonb-Feld `data`. */
export interface QuestionnaireData {
  // 1. Persönliche Angaben
  geburtsname?: string;
  geburtsdatum?: string; // ISO
  geburtsort?: string;
  geburtsland?: string;
  staatsangehoerigkeit?: string;
  familienstand?: string;
  geschlecht?: "maennlich" | "weiblich" | "divers" | "unbestimmt" | "";
  schwerbehindert?: boolean;
  sv_nummer_vorhanden?: boolean; // SV-Nr. selbst liegt verschlüsselt separat

  // 3. Beschäftigung
  haupt_oder_neben?: "haupt" | "neben" | "";
  weitere_beschaeftigungen?: boolean;
  weitere_taetigkeit?: string; // Freitext: welche weitere(n) Beschäftigung(en)
  weitere_geringfuegig?: boolean;

  // 4. Schul- und Berufsausbildung
  schulabschluss?: string;
  berufsausbildung?: string;

  // 7. Steuerliche Angaben (Steuer-ID verschlüsselt separat)
  steuerklasse?: string;
  kinderfreibetraege?: string;
  konfession?: string;

  // 8. Sozialversicherung
  kv_art?: "gesetzlich" | "privat" | "";
  kv_name?: string;

  // 2. Bankverbindung (IBAN verschlüsselt separat)
  abweichender_kontoinhaber?: string;

  // 10. Vermögenswirksame Leistungen (optional)
  vwl_empfaenger?: string;
  vwl_betrag_eur?: string;
  vwl_vertragsnummer?: string;
  vwl_iban?: string;

  // 12. Kinder (optional)
  kinder?: Array<{ name?: string; vorname?: string; geburtsdatum?: string }>;
}

export interface EmploymentQuestionnaireRow {
  id: string;
  employment_contract_id: string;
  status: QuestionnaireStatus;
  data: QuestionnaireData;
  steuer_id_encrypted: string | null;
  iban_encrypted: string | null;
  iban_last4: string | null;
  bic: string | null;
  sv_nummer_encrypted: string | null;
  pdf_path: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export const VARIANT_LABELS: Record<EmploymentVariant, string> = {
  werkstudent: "Werkstudent",
  angestellter: "Angestellter",
};

/** Vollständiger Mitarbeitername aus Vor-/Nachname. */
export function employeeName(c: Pick<EmploymentContractRow, "employee_first_name" | "employee_last_name">): string {
  return [c.employee_first_name, c.employee_last_name].filter(Boolean).join(" ").trim();
}
