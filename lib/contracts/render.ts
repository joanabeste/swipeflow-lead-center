// Baut das ContractRenderInput aus einer Vertrags-Zeile + Lead. Server-only
// (liest Gläubiger-Infos aus Env, entschlüsselt ggf. die IBAN).

import { decryptSecret } from "@/lib/crypto/secrets";
import { maskIban } from "./format";
import type { ContractRenderInput } from "./template";
import type { ContractRow, ContractLead } from "./types";

export function getCreditor(): { id: string; name: string; address: string } {
  return {
    id: process.env.SEPA_CREDITOR_ID ?? "",
    name: process.env.SEPA_CREDITOR_NAME ?? "swipeflow GmbH",
    address: process.env.SEPA_CREDITOR_ADDRESS ?? "Ringstraße 6, 32339 Espelkamp",
  };
}

/** Stabile, gut lesbare Mandatsreferenz pro Vertrag. */
export function mandateReference(contractId: string): string {
  return `SF-${contractId.slice(0, 8).toUpperCase()}`;
}

function joinPlzCity(zip: string | null, city: string | null): string {
  return [zip, city].filter(Boolean).join(" ").trim();
}

/** Maskierte IBAN-Anzeige aus den gespeicherten Feldern (ohne Entschlüsseln). */
function maskedFromStored(contract: ContractRow): string {
  if (contract.sepa_iban_last4) return `•••• •••• •••• ${contract.sepa_iban_last4}`;
  return "";
}

export function buildRenderInput(
  contract: ContractRow,
  lead: ContractLead | null,
  opts: {
    mode: "view" | "pdf";
    signature?: { dataUrl: string; signedAt: string; signerName: string } | null;
    /** Klartext-IBAN (z. B. direkt beim Signieren) → korrekt maskierte Anzeige. */
    ibanPlain?: string | null;
  },
): ContractRenderInput {
  const customerName = contract.billing_company || lead?.company_name || "";
  const street = contract.billing_street || lead?.street || "";
  const plzCity = joinPlzCity(
    contract.billing_zip ?? lead?.zip ?? null,
    contract.billing_city ?? lead?.city ?? null,
  );

  let sepa: ContractRenderInput["sepa"] = null;
  if (contract.payment_method === "sepa" && opts.mode === "pdf") {
    const ibanMasked = opts.ibanPlain
      ? maskIban(opts.ibanPlain)
      : maskedFromStored(contract);
    if (contract.sepa_account_holder || ibanMasked) {
      sepa = { accountHolder: contract.sepa_account_holder ?? "", ibanMasked };
    }
  }

  return {
    mode: opts.mode,
    customerName,
    street,
    plzCity,
    setupPriceCents: contract.setup_price_cents,
    monthlyMaintCents: contract.monthly_maint_cents,
    paymentMode: contract.payment_mode,
    installmentCount: contract.installment_count,
    paymentMethod: contract.payment_method,
    creditor: getCreditor(),
    mandateReference: mandateReference(contract.id),
    sepa,
    signature: opts.signature ?? null,
  };
}

/** Entschlüsselt die gespeicherte IBAN (nur server-seitig, nur wenn nötig). */
export function decryptIban(contract: ContractRow): string | null {
  if (!contract.sepa_iban_encrypted) return null;
  try {
    return decryptSecret(contract.sepa_iban_encrypted);
  } catch (e) {
    // Entschlüsselung fehlgeschlagen (z.B. nach Key-Rotation oder Datenkorruption).
    // Nicht still verschlucken — sonst verschwindet die IBAN aus SEPA-Mandaten ohne Alarm.
    console.error(`[contracts:decryptIban] Entschlüsselung für Vertrag ${contract.id} fehlgeschlagen:`, e);
    return null;
  }
}
