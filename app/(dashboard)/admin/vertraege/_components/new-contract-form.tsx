"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createContract } from "../actions";
import { parseEuroToCents } from "@/lib/contracts/format";
import type { ContractLead } from "@/lib/contracts/types";
import { ContractTermsFields, Section, Field, Toggle, inputCls, type TermsState } from "./contract-terms-fields";

const DEFAULT_TERMS: TermsState = {
  setupEur: "2000",
  monthlyEur: "0",
  paymentMode: "einmal",
  installments: "3",
  paymentMethod: "sepa",
};

export function NewContractForm({ customers }: { customers: ContractLead[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<"existing" | "new">(customers.length > 0 ? "existing" : "new");
  const [leadId, setLeadId] = useState(customers[0]?.id ?? "");
  const [ncName, setNcName] = useState("");
  const [ncCity, setNcCity] = useState("");
  const [ncEmail, setNcEmail] = useState("");

  const [terms, setTerms] = useState<TermsState>(DEFAULT_TERMS);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    const res = await createContract({
      lead_id: mode === "existing" ? leadId : undefined,
      new_customer: mode === "new" ? { company_name: ncName, city: ncCity, email: ncEmail } : undefined,
      setup_price_cents: parseEuroToCents(terms.setupEur),
      monthly_maint_cents: parseEuroToCents(terms.monthlyEur),
      payment_mode: terms.paymentMode,
      installment_count: terms.paymentMode === "raten" ? Number(terms.installments) : null,
      payment_method: terms.paymentMethod,
    });
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    router.push(`/admin/vertraege/${res.id}`);
  }

  return (
    <div className="space-y-6">
      <Section title="Kunde">
        <div className="mb-3 flex gap-2">
          <Toggle active={mode === "existing"} onClick={() => setMode("existing")} disabled={customers.length === 0}>
            Bestehender Kunde
          </Toggle>
          <Toggle active={mode === "new"} onClick={() => setMode("new")}>
            Neuer Kunde
          </Toggle>
        </div>
        {mode === "existing" ? (
          <select
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            className={inputCls}
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name || "Unbenannt"}{c.email ? ` · ${c.email}` : ""}
              </option>
            ))}
          </select>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Firmenname *">
              <input value={ncName} onChange={(e) => setNcName(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Stadt">
              <input value={ncCity} onChange={(e) => setNcCity(e.target.value)} className={inputCls} />
            </Field>
            <Field label="E-Mail (für Versand)">
              <input type="email" value={ncEmail} onChange={(e) => setNcEmail(e.target.value)} className={inputCls} />
            </Field>
          </div>
        )}
      </Section>

      <ContractTermsFields value={terms} onChange={setTerms} />

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</p>}

      <div className="flex justify-end">
        <button
          onClick={submit}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Vertrag anlegen
        </button>
      </div>
    </div>
  );
}
