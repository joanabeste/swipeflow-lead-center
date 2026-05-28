// Baut das ContractRenderInput aus einer Vertrags-Zeile + Lead. Server-only
// (entschlüsselt ggf. die IBAN). Die Gläubigerdaten werden vom Aufrufer
// übergeben (siehe lib/contracts/settings.ts → loadCreditor()).

import { decryptSecret } from "@/lib/crypto/secrets";
import { formatIban } from "./format";
import type { Creditor } from "./settings";
import type { ContractRenderInput } from "./template";
import type { ContractRow, ContractLead } from "./types";

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
    creditor: Creditor;
    signature?: { dataUrl: string; signedAt: string; signerName: string } | null;
    /** Hinterlegte swipeflow-Unterschrift (data:URL), falls vorhanden. */
    providerSignature?: { dataUrl: string } | null;
    /** Klartext-IBAN (z. B. direkt beim Signieren) → volle, lesbare Anzeige im Mandat. */
    ibanPlain?: string | null;
  },
): ContractRenderInput {
  const customerName = contract.billing_company || lead?.company_name || "";
  const street = contract.billing_street || lead?.street || "";
  const plzCity = joinPlzCity(
    contract.billing_zip ?? lead?.zip ?? null,
    contract.billing_city ?? lead?.city ?? null,
  );

  // SEPA-Block befüllen, sobald Daten vorliegen — unabhängig vom Modus, damit
  // auch die Schritt-2-Vorschau (view) die eingegebenen Daten zeigt. Ohne Daten
  // (z. B. initialer View vor Eingabe) bleibt sepa null → leere Platzhalter.
  let sepa: ContractRenderInput["sepa"] = null;
  if (contract.payment_method === "sepa") {
    // Klartext-IBAN (live eingegeben / beim Signieren entschlüsselt) → voll lesbar
    // zur Verifikation; ohne Klartext nur maskierte Last4 aus dem gespeicherten Feld.
    const ibanDisplay = opts.ibanPlain
      ? formatIban(opts.ibanPlain)
      : maskedFromStored(contract);
    if (contract.sepa_account_holder || ibanDisplay) {
      sepa = { accountHolder: contract.sepa_account_holder ?? "", ibanDisplay };
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
    creditor: opts.creditor,
    mandateReference: mandateReference(contract.id),
    sepa,
    signature: opts.signature ?? null,
    providerSignature: opts.providerSignature ?? null,
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
