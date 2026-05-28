"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, UserPlus, X } from "lucide-react";
import { createContract } from "../actions";
import { Button } from "@/components/ui/button";
import { parseEuroToCents } from "@/lib/contracts/format";
import type { ContractPickerLead } from "@/lib/contracts/types";
import {
  ContractTermsFields,
  ContractAddressFields,
  Section,
  Field,
  inputCls,
  EMPTY_ADDRESS,
  type TermsState,
  type AddressState,
} from "./contract-terms-fields";

const DEFAULT_TERMS: TermsState = {
  setupEur: "2000",
  monthlyEur: "50",
  paymentMode: "einmal",
  installments: "3",
  paymentMethod: "sepa",
};

function addressFromCustomer(c: ContractPickerLead | undefined): AddressState {
  if (!c) return EMPTY_ADDRESS;
  return {
    company: c.company_name ?? "",
    street: c.street ?? "",
    zip: c.zip ?? "",
    city: c.city ?? "",
    email: c.email ?? "",
    country: "Deutschland",
  };
}

export function NewContractForm({ customers }: { customers: ContractPickerLead[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<"pick" | "new">(customers.length > 0 ? "pick" : "new");
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");

  const [ncName, setNcName] = useState("");
  const [ncCity, setNcCity] = useState("");
  const [ncEmail, setNcEmail] = useState("");

  const [address, setAddress] = useState<AddressState>(EMPTY_ADDRESS);
  const [terms, setTerms] = useState<TermsState>(DEFAULT_TERMS);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => customers.find((c) => c.id === selectedId),
    [customers, selectedId],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? customers.filter(
          (c) =>
            (c.company_name ?? "").toLowerCase().includes(q) ||
            (c.email ?? "").toLowerCase().includes(q),
        )
      : customers;
    return list.slice(0, 8);
  }, [customers, query]);

  function pick(c: ContractPickerLead) {
    setSelectedId(c.id);
    setAddress(addressFromCustomer(c));
    setError(null);
  }

  function clearSelection() {
    setSelectedId("");
    setAddress(EMPTY_ADDRESS);
  }

  async function submit() {
    setError(null);
    if (mode === "pick" && !selectedId) {
      setError("Bitte einen Kunden auswählen oder „Neuer Kunde“ wählen.");
      return;
    }
    if (mode === "new" && !ncName.trim()) {
      setError("Bitte einen Firmennamen für den neuen Kunden angeben.");
      return;
    }
    setBusy(true);
    const res = await createContract({
      lead_id: mode === "pick" ? selectedId : undefined,
      new_customer: mode === "new" ? { company_name: ncName, city: ncCity, email: ncEmail } : undefined,
      setup_price_cents: parseEuroToCents(terms.setupEur),
      monthly_maint_cents: parseEuroToCents(terms.monthlyEur),
      payment_mode: terms.paymentMode,
      installment_count: terms.paymentMode === "raten" ? Number(terms.installments) : null,
      payment_method: terms.paymentMethod,
      billing: address,
    });
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    router.push(`/vertraege/${res.id}`);
  }

  return (
    <div className="space-y-6">
      <Section title="Kunde">
        {mode === "pick" ? (
          selected ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
                    {selected.company_name || "Unbenannt"}
                  </span>
                  <LeadBadge stage={selected.lifecycle_stage} />
                </div>
                {selected.email && (
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">{selected.email}</p>
                )}
              </div>
              <button
                type="button"
                onClick={clearSelection}
                className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X className="h-3.5 w-3.5" /> Ändern
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Kunde oder Lead suchen (Firma oder E-Mail)…"
                  className={`${inputCls} pl-9`}
                />
              </div>
              <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-200 dark:border-[#2c2c2e]">
                {results.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-gray-400">Keine Treffer.</p>
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-[#2c2c2e]/60">
                    {results.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => pick(c)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-gray-50 dark:hover:bg-white/5"
                        >
                          <div className="min-w-0">
                            <span className="block truncate text-sm text-gray-900 dark:text-white">
                              {c.company_name || "Unbenannt"}
                            </span>
                            {c.email && (
                              <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{c.email}</span>
                            )}
                          </div>
                          <LeadBadge stage={c.lifecycle_stage} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                type="button"
                onClick={() => setMode("new")}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <UserPlus className="h-4 w-4" /> Neuer Kunde manuell
              </button>
            </div>
          )
        ) : (
          <div className="space-y-3">
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
            {customers.length > 0 && (
              <button
                type="button"
                onClick={() => setMode("pick")}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <Search className="h-4 w-4" /> Stattdessen bestehenden Kunden/Lead suchen
              </button>
            )}
          </div>
        )}
      </Section>

      <ContractAddressFields value={address} onChange={setAddress} />

      <ContractTermsFields value={terms} onChange={setTerms} />

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</p>}

      <div className="flex justify-end">
        <Button onClick={submit} busy={busy} size="md">
          Vertrag anlegen
        </Button>
      </div>
    </div>
  );
}

function LeadBadge({ stage }: { stage: string | null }) {
  const isCustomer = stage === "customer";
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        isCustomer
          ? "bg-primary/15 text-primary"
          : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-300"
      }`}
    >
      {isCustomer ? "Kunde" : "Lead aus CRM"}
    </span>
  );
}
