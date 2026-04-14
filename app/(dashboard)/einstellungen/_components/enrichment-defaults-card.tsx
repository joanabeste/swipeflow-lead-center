"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import type { EnrichmentConfig, ServiceMode } from "@/lib/types";
import { saveEnrichmentDefaults } from "../actions";
import { Card, SubmitButton } from "./ui";

type EnrichmentBoolKey = "contacts_management" | "contacts_hr" | "contacts_all" | "job_postings" | "career_page" | "company_details";

const ENRICHMENT_OPTIONS: { key: EnrichmentBoolKey; label: string; hint?: string }[] = [
  { key: "contacts_management", label: "Geschäftsführung & Management", hint: "GF, Inhaber, Vorstand" },
  { key: "contacts_hr", label: "HR-Verantwortliche", hint: "Personal, Recruiting, Ausbildung, Bewerbermanagement" },
  { key: "contacts_all", label: "Alle weiteren Ansprechpartner", hint: "Vertrieb, Support, sonstige" },
  { key: "job_postings", label: "Stellenanzeigen", hint: "Offene Stellen von der Karriereseite" },
  { key: "career_page", label: "Karriereseite", hint: "Karriereseiten-URL finden" },
  { key: "company_details", label: "Firmendaten", hint: "Größe, Rechtsform, Adresse" },
];

export function EnrichmentDefaultsCard({
  mode,
  label,
  config,
}: {
  mode: ServiceMode;
  label: string;
  config: EnrichmentConfig;
}) {
  const [state, formAction, pending] = useActionState(saveEnrichmentDefaults, undefined);
  const justSaved = state?.success && state.mode === mode;
  const justError = state?.error && state.mode === mode;

  return (
    <Card>
      <form action={formAction}>
        <input type="hidden" name="mode" value={mode} />
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{label}</h3>
          {justSaved && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/20 dark:text-green-400">
              <Check className="h-3 w-3" />
              Gespeichert
            </span>
          )}
        </div>
        {justError && (
          <div className="mt-3 rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {state?.error}
          </div>
        )}
        <div className="mt-4 space-y-2.5">
          {ENRICHMENT_OPTIONS.map((opt) => (
            <label key={opt.key} className="flex items-start gap-2.5 rounded-lg border border-transparent p-2 text-sm transition hover:border-gray-200 hover:bg-gray-50 dark:hover:border-[#2c2c2e] dark:hover:bg-white/5">
              <input
                type="checkbox"
                name={opt.key}
                defaultChecked={config[opt.key]}
                className="mt-0.5 rounded border-gray-300 dark:border-gray-600"
              />
              <span>
                <span className="block font-medium">{opt.label}</span>
                {opt.hint && (
                  <span className="block text-xs text-gray-500 dark:text-gray-400">{opt.hint}</span>
                )}
              </span>
            </label>
          ))}
        </div>
        <div className="mt-5">
          <SubmitButton pending={pending}>Speichern</SubmitButton>
        </div>
      </form>
    </Card>
  );
}
