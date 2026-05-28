export type ContractStatus = "draft" | "sent" | "viewed" | "signed" | "cancelled";
export type ContractType = "webdesign" | "recruiting";
export type PaymentMode = "einmal" | "raten";
export type PaymentMethod = "sepa" | "rechnung";

export type ContractEventType =
  | "created"
  | "sent"
  | "viewed"
  | "signed"
  | "downloaded"
  | "resent"
  | "extended"
  | "cancelled";

export interface ContractRow {
  id: string;
  lead_id: string;
  type: ContractType;
  status: ContractStatus;
  token: string | null;

  setup_price_cents: number;
  monthly_maint_cents: number;
  payment_mode: PaymentMode;
  installment_count: number | null;
  payment_method: PaymentMethod;

  billing_company: string | null;
  billing_street: string | null;
  billing_zip: string | null;
  billing_city: string | null;
  billing_email: string | null;
  billing_country: string | null;

  sepa_account_holder: string | null;
  sepa_iban_encrypted: string | null;
  sepa_iban_last4: string | null;
  sepa_bic: string | null;

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

/** Minimaler Lead-Ausschnitt, den Verträge brauchen. */
export interface ContractLead {
  id: string;
  company_name: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  email: string | null;
}

/** Lead-Ausschnitt für den Kunden-Picker (inkl. Lifecycle für Kunde/Lead-Badge). */
export interface ContractPickerLead extends ContractLead {
  lifecycle_stage: string | null;
}

export interface ContractEvent {
  id: string;
  contract_id: string;
  event: ContractEventType;
  actor_user_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export const STATUS_LABELS: Record<ContractStatus, string> = {
  draft: "Entwurf",
  sent: "Gesendet",
  viewed: "Angesehen",
  signed: "Unterschrieben",
  cancelled: "Storniert",
};

export const EVENT_LABELS: Record<ContractEventType, string> = {
  created: "Erstellt",
  sent: "Gesendet",
  viewed: "Vom Kunden geöffnet",
  signed: "Unterschrieben",
  downloaded: "PDF heruntergeladen",
  resent: "Erneut gesendet",
  extended: "Gültigkeit verlängert",
  cancelled: "Storniert",
};

export function isExpired(contract: Pick<ContractRow, "expires_at" | "status">): boolean {
  if (!contract.expires_at) return false;
  if (contract.status === "signed" || contract.status === "cancelled") return false;
  return new Date(contract.expires_at).getTime() < Date.now();
}
