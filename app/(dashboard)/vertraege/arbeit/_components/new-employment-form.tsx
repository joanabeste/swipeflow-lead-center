"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { parseEuroToCents } from "@/lib/contracts/format";
import { Section, Field, Toggle, inputCls } from "../../_components/contract-terms-fields";
import { defaultsFor, type EmploymentTermsState } from "@/lib/employment/defaults";
import type { EmploymentVariant } from "@/lib/employment/types";
import { createEmploymentContract, type EmploymentInput } from "../actions";

interface EmployeeState {
  firstName: string;
  lastName: string;
  street: string;
  zip: string;
  city: string;
  email: string;
}

const EMPTY_EMPLOYEE: EmployeeState = {
  firstName: "",
  lastName: "",
  street: "",
  zip: "",
  city: "",
  email: "",
};

export function NewEmploymentForm() {
  const router = useRouter();
  const [variant, setVariant] = useState<EmploymentVariant>("werkstudent");
  const [employee, setEmployee] = useState<EmployeeState>(EMPTY_EMPLOYEE);
  const [terms, setTerms] = useState<EmploymentTermsState>(defaultsFor("werkstudent"));
  const [pending, setPending] = useState<"draft" | "link" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function chooseVariant(v: EmploymentVariant) {
    setVariant(v);
    setTerms(defaultsFor(v));
  }

  const setE = (patch: Partial<EmployeeState>) => setEmployee((s) => ({ ...s, ...patch }));
  const setT = (patch: Partial<EmploymentTermsState>) => setTerms((s) => ({ ...s, ...patch }));

  function buildInput(): EmploymentInput {
    return {
      variant,
      employee: {
        firstName: employee.firstName,
        lastName: employee.lastName,
        street: employee.street,
        zip: employee.zip,
        city: employee.city,
        email: employee.email,
      },
      start_date: terms.startDate || null,
      fixed_term: terms.fixedTerm,
      end_date: terms.endDate || null,
      probation_months: Number(terms.probationMonths) || 0,
      pay_model: terms.payModel,
      hourly_wage_cents: parseEuroToCents(terms.hourlyEur),
      monthly_salary_cents: parseEuroToCents(terms.monthlyEur),
      commission_per_appointment_cents: parseEuroToCents(terms.commissionEur),
      weekly_hours: Number(terms.weeklyHours) || 0,
      workdays_per_week: Number(terms.workdaysPerWeek) || 1,
      vacation_days: Number(terms.vacationDays) || 0,
      travel_cost_reimbursed: terms.travelCostReimbursed,
      notice_period_model: terms.noticePeriodModel,
    };
  }

  async function submit(target: "draft" | "link") {
    setError(null);
    if (!employee.firstName.trim() || !employee.lastName.trim()) {
      setError("Bitte Vor- und Nachname des Mitarbeiters angeben.");
      return;
    }
    setPending(target);
    const res = await createEmploymentContract(buildInput());
    if ("error" in res) {
      setPending(null);
      setError(res.error);
      return;
    }
    router.push(target === "draft" ? "/vertraege/arbeit" : `/vertraege/arbeit/${res.id}`);
  }

  const isWerk = variant === "werkstudent";

  return (
    <div className="space-y-6">
      <Section title="Vertragsart">
        <div className="flex flex-wrap gap-2">
          <Toggle active={isWerk} onClick={() => chooseVariant("werkstudent")}>Werkstudent</Toggle>
          <Toggle active={!isWerk} onClick={() => chooseVariant("angestellter")}>Angestellter</Toggle>
        </div>
        <p className="text-[11px] text-gray-400">
          Die Vertragsart setzt sinnvolle Standardwerte und steuert die Rechtsklauseln (Werkstudentenstatus, Kündigung, Reisekosten).
        </p>
      </Section>

      <Section title="Mitarbeiter">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Vorname *">
            <input value={employee.firstName} onChange={(e) => setE({ firstName: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Nachname *">
            <input value={employee.lastName} onChange={(e) => setE({ lastName: e.target.value })} className={inputCls} />
          </Field>
        </div>
        <Field label="Straße & Hausnummer">
          <input value={employee.street} onChange={(e) => setE({ street: e.target.value })} className={inputCls} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="PLZ">
            <input value={employee.zip} onChange={(e) => setE({ zip: e.target.value })} className={inputCls} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Ort">
              <input value={employee.city} onChange={(e) => setE({ city: e.target.value })} className={inputCls} />
            </Field>
          </div>
        </div>
        <Field label="E-Mail (für den Vertragsversand)">
          <input type="email" value={employee.email} onChange={(e) => setE({ email: e.target.value })} className={inputCls} />
        </Field>
      </Section>

      <Section title="Eckdaten">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Eintrittsdatum">
            <input type="date" value={terms.startDate} onChange={(e) => setT({ startDate: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Probezeit (Monate)">
            <input inputMode="numeric" value={terms.probationMonths} onChange={(e) => setT({ probationMonths: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Befristung">
            <div className="flex gap-2">
              <Toggle active={terms.fixedTerm} onClick={() => setT({ fixedTerm: true })}>Befristet</Toggle>
              <Toggle active={!terms.fixedTerm} onClick={() => setT({ fixedTerm: false })}>Unbefristet</Toggle>
            </div>
          </Field>
        </div>
        {terms.fixedTerm && (
          <Field label="Befristet bis *">
            <input type="date" value={terms.endDate} onChange={(e) => setT({ endDate: e.target.value })} className={`${inputCls} max-w-[220px]`} />
          </Field>
        )}
      </Section>

      <Section title="Vergütung">
        <Field label="Vergütungsmodell">
          <div className="flex gap-2">
            <Toggle active={terms.payModel === "hourly"} onClick={() => setT({ payModel: "hourly" })}>Stundenlohn</Toggle>
            <Toggle active={terms.payModel === "monthly"} onClick={() => setT({ payModel: "monthly" })}>Monatsgehalt</Toggle>
          </div>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          {terms.payModel === "hourly" ? (
            <Field label="Stundenlohn (€ brutto)">
              <input inputMode="decimal" value={terms.hourlyEur} onChange={(e) => setT({ hourlyEur: e.target.value })} className={inputCls} />
            </Field>
          ) : (
            <Field label="Monatsgehalt (€ brutto)">
              <input inputMode="decimal" value={terms.monthlyEur} onChange={(e) => setT({ monthlyEur: e.target.value })} className={inputCls} />
            </Field>
          )}
          <Field label="Provision je qualifiziertem Termin (€ brutto)">
            <input inputMode="decimal" value={terms.commissionEur} onChange={(e) => setT({ commissionEur: e.target.value })} className={inputCls} />
          </Field>
        </div>
      </Section>

      <Section title="Arbeitszeit & Urlaub">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Wochenstunden">
            <input inputMode="decimal" value={terms.weeklyHours} onChange={(e) => setT({ weeklyHours: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Arbeitstage / Woche">
            <input inputMode="numeric" value={terms.workdaysPerWeek} onChange={(e) => setT({ workdaysPerWeek: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Urlaubstage / Jahr">
            <input inputMode="numeric" value={terms.vacationDays} onChange={(e) => setT({ vacationDays: e.target.value })} className={inputCls} />
          </Field>
        </div>
      </Section>

      <Section title="Klauseln">
        <Field label="Reisekosten zu angeordneten Pflichtterminen">
          <div className="flex gap-2">
            <Toggle active={terms.travelCostReimbursed} onClick={() => setT({ travelCostReimbursed: true })}>Werden erstattet</Toggle>
            <Toggle active={!terms.travelCostReimbursed} onClick={() => setT({ travelCostReimbursed: false })}>Trägt Mitarbeiter</Toggle>
          </div>
        </Field>
        {!isWerk && (
          <Field label="Kündigungsfrist nach der Probezeit">
            <div className="flex gap-2">
              <Toggle active={terms.noticePeriodModel === "monat_zum_monatsende"} onClick={() => setT({ noticePeriodModel: "monat_zum_monatsende" })}>1 Monat zum Monatsende</Toggle>
              <Toggle active={terms.noticePeriodModel === "gesetzlich"} onClick={() => setT({ noticePeriodModel: "gesetzlich" })}>Gesetzliche Fristen</Toggle>
            </div>
          </Field>
        )}
        {isWerk && (
          <p className="text-[11px] text-gray-400">
            Werkstudentenverträge enthalten automatisch die Werkstudentenstatus-Klausel (§ 5) und enden mit Studienende/Exmatrikulation. Kündigung nach gesetzlichen Fristen.
          </p>
        )}
      </Section>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</p>}

      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={() => submit("draft")} busy={pending === "draft"} disabled={pending !== null} size="md">
          Als Entwurf speichern
        </Button>
        <Button onClick={() => submit("link")} busy={pending === "link"} disabled={pending !== null} size="md">
          Anlegen & weiter
        </Button>
      </div>
    </div>
  );
}
