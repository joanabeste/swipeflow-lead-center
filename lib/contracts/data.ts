// Daten-Loader für Verträge. Admin-seitig: createClient() (RLS).

import { createClient } from "@/lib/supabase/server";
import type { ContractRow, ContractLead, ContractPickerLead, ContractEvent } from "./types";

const CONTRACT_COLS =
  "id, lead_id, type, status, token, setup_price_cents, monthly_maint_cents, payment_mode, installment_count, payment_method, job_title, campaign_start, campaign_end, ad_budget_cents, applicant_guarantee, billing_company, billing_street, billing_zip, billing_city, billing_email, billing_country, sepa_account_holder, sepa_iban_encrypted, sepa_iban_last4, sepa_bic, signature_path, pdf_path, terms_snapshot, sent_at, viewed_at, signed_at, expires_at, created_by, created_at, updated_at";

export interface ContractListItem {
  id: string;
  type: ContractRow["type"];
  status: ContractRow["status"];
  setup_price_cents: number;
  monthly_maint_cents: number;
  sent_at: string | null;
  signed_at: string | null;
  expires_at: string | null;
  created_at: string;
  company_name: string | null;
}

export async function loadContracts(opts?: { recurringOnly?: boolean }): Promise<ContractListItem[]> {
  const db = await createClient();
  let query = db
    .from("contracts")
    .select(
      "id, type, status, setup_price_cents, monthly_maint_cents, sent_at, signed_at, expires_at, created_at, leads:lead_id(company_name)",
    )
    .order("created_at", { ascending: false });
  // Wiederkehrend = aktive (unterschriebene) Verträge mit monatlichem Hosting/Wartungsanteil.
  if (opts?.recurringOnly) {
    query = query.gt("monthly_maint_cents", 0).eq("status", "signed");
  }
  const { data, error } = await query;
  if (error) {
    console.error("[loadContracts]", error);
    return [];
  }
  return (data ?? []).map((r) => {
    const rec = r as Record<string, unknown>;
    const lead = rec.leads as { company_name: string | null } | null;
    return {
      id: rec.id as string,
      type: rec.type as ContractRow["type"],
      status: rec.status as ContractRow["status"],
      setup_price_cents: rec.setup_price_cents as number,
      monthly_maint_cents: rec.monthly_maint_cents as number,
      sent_at: (rec.sent_at as string | null) ?? null,
      signed_at: (rec.signed_at as string | null) ?? null,
      expires_at: (rec.expires_at as string | null) ?? null,
      created_at: rec.created_at as string,
      company_name: lead?.company_name ?? null,
    };
  });
}

export async function loadContract(id: string): Promise<{ contract: ContractRow; lead: ContractLead | null } | null> {
  const db = await createClient();
  const { data, error } = await db.from("contracts").select(CONTRACT_COLS).eq("id", id).maybeSingle();
  if (error || !data) {
    if (error) console.error("[loadContract]", error);
    return null;
  }
  const contract = data as unknown as ContractRow;
  const { data: leadData } = await db
    .from("leads")
    .select("id, company_name, street, zip, city, email")
    .eq("id", contract.lead_id)
    .maybeSingle();
  return { contract, lead: (leadData as ContractLead | null) ?? null };
}

export async function loadContractEvents(contractId: string): Promise<ContractEvent[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("contract_events")
    .select("id, contract_id, event, actor_user_id, meta, created_at")
    .eq("contract_id", contractId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[loadContractEvents]", error);
    return [];
  }
  return (data ?? []) as ContractEvent[];
}

/** Alle Leads/Kunden für den Vertrags-Picker (Suche über das ganze CRM).
 *  Kunden zuerst, dann alphabetisch — Nicht-Kunden werden beim Anlegen befördert. */
export async function loadLeadsForPicker(): Promise<ContractPickerLead[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("leads")
    .select("id, company_name, street, zip, city, email, lifecycle_stage")
    .is("deleted_at", null)
    .order("company_name", { ascending: true });
  if (error) {
    console.error("[loadLeadsForPicker]", error);
    return [];
  }
  const rows = (data ?? []) as ContractPickerLead[];
  // Kunden zuerst (stabil), Reihenfolge sonst alphabetisch wie geladen.
  return rows.sort((a, b) => {
    const ca = a.lifecycle_stage === "customer" ? 0 : 1;
    const cb = b.lifecycle_stage === "customer" ? 0 : 1;
    return ca - cb;
  });
}
