"use client";

import { parseEuroToCents, formatEuro, splitInstallments } from "@/lib/contracts/format";
import type { ContractType, PaymentMode, PaymentMethod } from "@/lib/contracts/types";

export interface TermsState {
  setupEur: string;
  monthlyEur: string;
  paymentMode: PaymentMode;
  installments: string;
  paymentMethod: PaymentMethod;
  // Recruiting
  jobTitle: string;
  campaignStart: string;
  campaignDays: string;
  campaignEnd: string;
  adBudgetEur: string;
  applicantGuarantee: boolean;
  // Content (campaignStart wird als Vertragsbeginn wiederverwendet)
  contentPlatforms: string;
  postsPerWeek: string;
  onsiteProduction: boolean;
  onsiteIntervalMonths: string;
  minTermMonths: string;
  noticeWeeks: string;
  // Widerrufsbelehrung beilegen (Privatkunde / Unternehmen in Gründung)
  withdrawalRight: boolean;
}

function addDays(iso: string, days: number): string {
  if (!iso || !Number.isFinite(days)) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDateDe(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export const inputCls =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-[#2c2c2e] dark:bg-[#1c1c1e] dark:text-white";

export function ContractTermsFields({
  value,
  onChange,
  type = "webdesign",
}: {
  value: TermsState;
  onChange: (next: TermsState) => void;
  type?: ContractType;
}) {
  const set = (patch: Partial<TermsState>) => onChange({ ...value, ...patch });

  const setCampaign = (patch: Partial<Pick<TermsState, "campaignStart" | "campaignDays">>) => {
    const start = patch.campaignStart ?? value.campaignStart;
    const days = patch.campaignDays ?? value.campaignDays;
    set({ ...patch, campaignEnd: addDays(start, Number(days)) });
  };

  const setupCents = parseEuroToCents(value.setupEur);
  const monthlyCents = parseEuroToCents(value.monthlyEur);
  const yearlyCents = monthlyCents * 12;
  const count = Number(value.installments);
  const showRatePreview = value.paymentMode === "raten" && count >= 2 && setupCents > 0;
  const { base, last } = showRatePreview ? splitInstallments(setupCents, count) : { base: 0, last: 0 };
  const isRecruiting = type === "recruiting";
  const isContent = type === "content";

  return (
    <>
      {isContent ? (
        <Section title="Content-Paket">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Monatlicher Betrag (€ netto)">
              <input inputMode="decimal" value={value.monthlyEur} onChange={(e) => set({ monthlyEur: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Einmalige Einrichtungsgebühr (€ netto, optional)">
              <input inputMode="decimal" value={value.setupEur} onChange={(e) => set({ setupEur: e.target.value })} className={inputCls} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Plattformen">
              <input value={value.contentPlatforms} onChange={(e) => set({ contentPlatforms: e.target.value })} className={inputCls} placeholder="Instagram und Facebook" />
            </Field>
            <Field label="Beiträge pro Woche">
              <input inputMode="numeric" value={value.postsPerWeek} onChange={(e) => set({ postsPerWeek: e.target.value })} className={`${inputCls} max-w-[120px]`} />
            </Field>
          </div>
          <Field label="Vor-Ort-Content-Produktion">
            <div className="flex items-center gap-2">
              <Toggle active={value.onsiteProduction} onClick={() => set({ onsiteProduction: true })}>Mit Vor-Ort</Toggle>
              <Toggle active={!value.onsiteProduction} onClick={() => set({ onsiteProduction: false })}>Ohne</Toggle>
              {value.onsiteProduction && (
                <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  alle
                  <input inputMode="numeric" value={value.onsiteIntervalMonths} onChange={(e) => set({ onsiteIntervalMonths: e.target.value })} className={`${inputCls} max-w-[64px]`} placeholder="—" />
                  Monate
                </span>
              )}
            </div>
            {value.onsiteProduction && (
              <p className="mt-1 text-[11px] text-gray-400">Leer lassen für „nach Bedarf“ (kein festes Intervall).</p>
            )}
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Vertragsbeginn (optional)">
              <input type="date" value={value.campaignStart} onChange={(e) => set({ campaignStart: e.target.value })} className={`${inputCls} dark:[&::-webkit-calendar-picker-indicator]:invert`} />
            </Field>
            <Field label="Mindestlaufzeit (Monate)">
              <input inputMode="numeric" value={value.minTermMonths} onChange={(e) => set({ minTermMonths: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Kündigungsfrist (Wochen)">
              <input inputMode="numeric" value={value.noticeWeeks} onChange={(e) => set({ noticeWeeks: e.target.value })} className={inputCls} />
            </Field>
          </div>
        </Section>
      ) : isRecruiting ? (
        <Section title="Kampagne">
          <Field label="Jobtitel">
            <input value={value.jobTitle} onChange={(e) => set({ jobTitle: e.target.value })} className={inputCls} placeholder="z. B. Steuerberater*in" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Startzeitpunkt">
              <input type="date" value={value.campaignStart} onChange={(e) => setCampaign({ campaignStart: e.target.value })} className={`${inputCls} dark:[&::-webkit-calendar-picker-indicator]:invert`} />
            </Field>
            <Field label="Laufzeit (Tage)">
              <input inputMode="numeric" value={value.campaignDays} onChange={(e) => setCampaign({ campaignDays: e.target.value })} className={inputCls} />
              {value.campaignEnd && (
                <p className="mt-1 text-[11px] text-gray-400">Ende: {formatDateDe(value.campaignEnd)}</p>
              )}
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Agenturleistung (€ netto)">
              <input inputMode="decimal" value={value.setupEur} onChange={(e) => set({ setupEur: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Werbebudget (€ netto)">
              <input inputMode="decimal" value={value.adBudgetEur} onChange={(e) => set({ adBudgetEur: e.target.value })} className={inputCls} />
            </Field>
          </div>
          <Field label="Bewerbergarantie (5 qualifizierte Bewerber in 30 Tagen, sonst Verlängerung & 60 % Erstattung)">
            <div className="flex gap-2">
              <Toggle active={value.applicantGuarantee} onClick={() => set({ applicantGuarantee: true })}>Mit Garantie</Toggle>
              <Toggle active={!value.applicantGuarantee} onClick={() => set({ applicantGuarantee: false })}>Ohne Garantie</Toggle>
            </div>
          </Field>
        </Section>
      ) : (
        <Section title="Konditionen">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Einmaliger Herstellungspreis (€ netto)">
              <input inputMode="decimal" value={value.setupEur} onChange={(e) => set({ setupEur: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Monatliche Wartung/Hosting (€ netto)">
              <input inputMode="decimal" value={value.monthlyEur} onChange={(e) => set({ monthlyEur: e.target.value })} className={inputCls} />
              {monthlyCents > 0 && (
                <p className="mt-1 text-[11px] text-gray-400">≈ {formatEuro(yearlyCents)} jährlich im Voraus</p>
              )}
            </Field>
          </div>
        </Section>
      )}

      <Section title="Zahlung">
        {!isRecruiting && !isContent && (
          <>
            <Field label="Zahlungsart (gilt nur für die Erstellung — Wartung wird immer jährlich abgerechnet)">
              <div className="flex gap-2">
                <Toggle active={value.paymentMode === "einmal"} onClick={() => set({ paymentMode: "einmal" })}>Einmalzahlung</Toggle>
                <Toggle active={value.paymentMode === "raten"} onClick={() => set({ paymentMode: "raten" })}>Ratenzahlung</Toggle>
              </div>
            </Field>
            {value.paymentMode === "raten" && (
              <Field label="Anzahl Raten">
                <input inputMode="numeric" value={value.installments} onChange={(e) => set({ installments: e.target.value })} className={`${inputCls} max-w-[120px]`} />
                {showRatePreview && (
                  <p className="mt-1 text-[11px] text-gray-400">
                    {base === last
                      ? `${count} × ${formatEuro(base)}`
                      : `${count - 1} × ${formatEuro(base)} + letzte Rate ${formatEuro(last)}`}
                  </p>
                )}
              </Field>
            )}
          </>
        )}
        <Field label="Zahlungsmethode">
          <div className="flex gap-2">
            <Toggle active={value.paymentMethod === "sepa"} onClick={() => set({ paymentMethod: "sepa" })}>SEPA-Lastschrift</Toggle>
            <Toggle active={value.paymentMethod === "rechnung"} onClick={() => set({ paymentMethod: "rechnung" })}>Rechnung</Toggle>
          </div>
        </Field>
        {isRecruiting && (
          <p className="text-[11px] text-gray-400">Zahlung erfolgt vor Kampagnenstart in einer Summe.</p>
        )}
        {isContent && (
          <p className="text-[11px] text-gray-400">Die monatliche Pauschale wird monatlich abgerechnet.</p>
        )}
      </Section>

      <Section title="Widerrufsrecht">
        <Field label="Privatkunde oder Unternehmen in Gründung">
          <div className="flex gap-2">
            <Toggle active={value.withdrawalRight} onClick={() => set({ withdrawalRight: true })}>Ja</Toggle>
            <Toggle active={!value.withdrawalRight} onClick={() => set({ withdrawalRight: false })}>Nein</Toggle>
          </div>
          <p className="mt-1 text-[11px] text-gray-400">
            Bei „Ja“ wird dem Vertrag eine Widerrufsbelehrung beigelegt (Verbraucher-Widerrufsrecht, § 13 BGB).
            Für gewerbliche Kunden (B2B) auf „Nein“ lassen.
          </p>
        </Field>
      </Section>
    </>
  );
}

export interface AddressState {
  company: string;
  street: string;
  zip: string;
  city: string;
  email: string;
  country: string;
}

export const EMPTY_ADDRESS: AddressState = {
  company: "",
  street: "",
  zip: "",
  city: "",
  email: "",
  country: "",
};

export function ContractAddressFields({
  value,
  onChange,
}: {
  value: AddressState;
  onChange: (next: AddressState) => void;
}) {
  const set = (patch: Partial<AddressState>) => onChange({ ...value, ...patch });
  return (
    <Section title="Anschrift (optional)">
      <p className="-mt-2 text-xs text-gray-400">
        Wenn bekannt, hier vorab eintragen — der Kunde sieht die Felder beim Signieren vorausgefüllt.
      </p>
      <Field label="Firma">
        <input value={value.company} onChange={(e) => set({ company: e.target.value })} className={inputCls} />
      </Field>
      <Field label="Straße & Nr.">
        <input value={value.street} onChange={(e) => set({ street: e.target.value })} className={inputCls} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="PLZ">
          <input value={value.zip} onChange={(e) => set({ zip: e.target.value })} className={inputCls} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Stadt">
            <input value={value.city} onChange={(e) => set({ city: e.target.value })} className={inputCls} />
          </Field>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Land">
          <input value={value.country} onChange={(e) => set({ country: e.target.value })} className={inputCls} />
        </Field>
        <Field label="E-Mail (für Versand)">
          <input type="email" value={value.email} onChange={(e) => set({ email: e.target.value })} className={inputCls} />
        </Field>
      </div>
    </Section>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
      <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
      {children}
    </label>
  );
}

export function Toggle({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl px-4 py-2 text-sm font-medium transition disabled:opacity-40 ${
        active
          ? "bg-primary text-gray-900"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/15"
      }`}
    >
      {children}
    </button>
  );
}
