"use server";

import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto/secrets";
import { isValidIban, normalizeIban, ibanLast4 } from "@/lib/contracts/format";
import { renderContractPdf, uploadContractPdf, uploadSignaturePng } from "@/lib/contracts/pdf";
import { buildRenderInput } from "@/lib/contracts/render";
import {
  sendContractSignedCustomerEmail,
  sendContractSignedNotifyEmail,
  buildContractAdminUrl,
} from "@/lib/email/central";
import type { ContractRow, ContractLead } from "@/lib/contracts/types";

export interface SubmitPayload {
  billing_company: string;
  billing_street: string;
  billing_zip: string;
  billing_city: string;
  billing_email: string;
  billing_country?: string;
  sepa_account_holder?: string;
  sepa_iban?: string;
  mandate_accepted?: boolean;
  signature_data_url: string;
  accept_contract?: boolean;
  accept_costs?: boolean;
  accept_privacy?: boolean;
  confirm_data_correct?: boolean;
}

type Result = { success: true } | { error: string };

export async function submitSignature(token: string, payload: SubmitPayload): Promise<Result> {
  const db = createServiceClient();

  const { data, error } = await db.from("contracts").select("*").eq("token", token).maybeSingle();
  if (error || !data) return { error: "Vertrag nicht gefunden." };
  const contract = data as unknown as ContractRow;

  if (contract.status === "signed") return { error: "Dieser Vertrag wurde bereits unterschrieben." };
  if (contract.status === "cancelled") return { error: "Dieser Vertrag ist nicht mehr gültig." };
  if (contract.status !== "sent" && contract.status !== "viewed") {
    return { error: "Dieser Vertrag kann nicht unterschrieben werden." };
  }
  if (contract.expires_at && new Date(contract.expires_at).getTime() < Date.now()) {
    return { error: "Der Link ist abgelaufen. Bitte fordern Sie einen neuen an." };
  }

  // Pflichtfelder
  const req = (v: string | undefined) => (v ?? "").trim();
  if (!req(payload.billing_company) || !req(payload.billing_street) || !req(payload.billing_zip) || !req(payload.billing_city)) {
    return { error: "Bitte füllen Sie die vollständige Rechnungsanschrift aus." };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(req(payload.billing_email))) {
    return { error: "Bitte geben Sie eine gültige E-Mail-Adresse an." };
  }

  // Pflicht-Einwilligungen (Vertragsannahme, Kosten, Datenschutz, Richtigkeit)
  if (
    !payload.accept_contract ||
    !payload.accept_costs ||
    !payload.accept_privacy ||
    !payload.confirm_data_correct
  ) {
    return { error: "Bitte bestätigen Sie alle Pflichtangaben." };
  }

  // SEPA-Validierung
  let ibanEncrypted: string | null = null;
  let ibanLast4Val: string | null = null;
  let ibanPlain: string | null = null;
  if (contract.payment_method === "sepa") {
    if (!payload.mandate_accepted) return { error: "Bitte stimmen Sie dem SEPA-Lastschriftmandat zu." };
    if (!req(payload.sepa_account_holder)) return { error: "Bitte geben Sie den Kontoinhaber an." };
    const iban = normalizeIban(payload.sepa_iban ?? "");
    if (!isValidIban(iban)) return { error: "Bitte geben Sie eine gültige IBAN an." };
    ibanPlain = iban;
    ibanEncrypted = encryptSecret(iban);
    ibanLast4Val = ibanLast4(iban);
  }

  // Signatur
  if (!/^data:image\/png;base64,/.test(payload.signature_data_url ?? "")) {
    return { error: "Bitte unterschreiben Sie im Unterschriftsfeld." };
  }
  const sigBase64 = (payload.signature_data_url ?? "").split(",")[1] ?? "";
  const sigBytes = Buffer.byteLength(sigBase64, "base64");
  if (sigBytes === 0) {
    return { error: "Bitte unterschreiben Sie im Unterschriftsfeld." };
  }
  if (sigBytes > 2 * 1024 * 1024) {
    return { error: "Die Unterschrift ist zu groß. Bitte versuchen Sie es erneut." };
  }

  const sig = await uploadSignaturePng(contract.id, payload.signature_data_url);
  if ("error" in sig) return { error: sig.error };

  const signedAt = new Date().toISOString();
  // Atomarer Statuswechsel: nur aus "sent"/"viewed" heraus. Ein paralleler
  // Submit (Doppelklick) findet den Status bereits auf "signed" und trifft 0
  // Zeilen → kein zweiter PDF-/E-Mail-Versand.
  const { data: updatedRows, error: updErr } = await db
    .from("contracts")
    .update({
      billing_company: req(payload.billing_company),
      billing_street: req(payload.billing_street),
      billing_zip: req(payload.billing_zip),
      billing_city: req(payload.billing_city),
      billing_email: req(payload.billing_email),
      billing_country: req(payload.billing_country) || "Deutschland",
      sepa_account_holder: contract.payment_method === "sepa" ? req(payload.sepa_account_holder) : null,
      sepa_iban_encrypted: ibanEncrypted,
      sepa_iban_last4: ibanLast4Val,
      signature_path: sig.path,
      status: "signed",
      signed_at: signedAt,
    })
    .eq("id", contract.id)
    .eq("token", token)
    .in("status", ["sent", "viewed"])
    .select("id");
  if (updErr) {
    console.error("[submitSignature:update]", updErr);
    return { error: "Speichern fehlgeschlagen. Bitte versuchen Sie es erneut." };
  }
  if (!updatedRows || updatedRows.length === 0) {
    return { error: "Dieser Vertrag wurde bereits unterschrieben." };
  }

  // Event protokollieren (IP / User-Agent + Einwilligungs-Nachweis).
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = hdrs.get("user-agent") ?? null;
  await db.from("contract_events").insert({
    contract_id: contract.id,
    event: "signed",
    actor_user_id: null,
    meta: {
      ip,
      user_agent: ua,
      consents: {
        contract: true,
        costs: true,
        privacy: true,
        data_correct: true,
        sepa_mandate: contract.payment_method === "sepa" ? true : null,
        accepted_at: signedAt,
      },
    },
  });

  // PDF generieren (best-effort — Signatur ist bereits gespeichert).
  let pdfBuffer: Buffer | null = null;
  try {
    const { data: leadData } = await db
      .from("leads")
      .select("id, company_name, street, zip, city, email")
      .eq("id", contract.lead_id)
      .maybeSingle();
    const updatedContract: ContractRow = {
      ...contract,
      billing_company: req(payload.billing_company),
      billing_street: req(payload.billing_street),
      billing_zip: req(payload.billing_zip),
      billing_city: req(payload.billing_city),
      sepa_account_holder: contract.payment_method === "sepa" ? req(payload.sepa_account_holder) : null,
      signed_at: signedAt,
    };
    const input = buildRenderInput(updatedContract, (leadData as ContractLead | null) ?? null, {
      mode: "pdf",
      ibanPlain,
      signature: {
        dataUrl: payload.signature_data_url,
        signedAt: new Date(signedAt).toLocaleDateString("de-DE"),
        signerName: req(payload.sepa_account_holder) || req(payload.billing_company),
      },
    });
    pdfBuffer = await renderContractPdf(input);
    const up = await uploadContractPdf(contract.id, pdfBuffer);
    if (!("error" in up)) {
      await db.from("contracts").update({ pdf_path: up.path }).eq("id", contract.id);
    }
  } catch (e) {
    console.error("[submitSignature:pdf]", e);
    // PDF kann später im Admin nachgeneriert werden.
  }

  // Bestätigung an Kunde + Benachrichtigung an swipeflow (best-effort).
  // Entkoppelt: schlägt die Kunden-Mail fehl, soll die interne Benachrichtigung
  // trotzdem rausgehen (und umgekehrt).
  const [customerMail, notifyMail] = await Promise.allSettled([
    sendContractSignedCustomerEmail({
      to: req(payload.billing_email),
      customerName: req(payload.billing_company),
      pdf: pdfBuffer,
    }),
    sendContractSignedNotifyEmail({
      customerName: req(payload.billing_company),
      adminUrl: buildContractAdminUrl(contract.id),
    }),
  ]);
  if (customerMail.status === "rejected") {
    console.error("[submitSignature:email:customer]", customerMail.reason);
  }
  if (notifyMail.status === "rejected") {
    console.error("[submitSignature:email:notify]", notifyMail.reason);
  }

  return { success: true };
}
