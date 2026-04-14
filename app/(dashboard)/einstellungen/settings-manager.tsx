"use client";

import { useActionState } from "react";
import { Plus, Trash2, Sparkles, Check } from "lucide-react";
import { hubspotFields } from "@/lib/hubspot/schema";
import type { RequiredFieldProfile, EnrichmentConfig, ServiceMode } from "@/lib/types";
import { saveFieldProfile, deleteFieldProfile, saveEnrichmentDefaults } from "./actions";

interface Props {
  fieldProfiles: RequiredFieldProfile[];
  enrichmentDefaults: Record<ServiceMode, EnrichmentConfig>;
}

const ENRICHMENT_OPTIONS: { key: keyof EnrichmentConfig; label: string; hint?: string }[] = [
  { key: "contacts_management", label: "Geschäftsführung & Management", hint: "GF, Inhaber, Vorstand" },
  { key: "contacts_all", label: "Alle Ansprechpartner", hint: "HR, Vertrieb, Support, weitere" },
  { key: "job_postings", label: "Stellenanzeigen", hint: "Offene Stellen von der Karriereseite" },
  { key: "career_page", label: "Karriereseite", hint: "Karriereseiten-URL finden" },
  { key: "company_details", label: "Firmendaten", hint: "Größe, Rechtsform, Adresse" },
];

function EnrichmentDefaultsCard({
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

  return (
    <form action={formAction} className="rounded-lg border border-gray-200 bg-white p-5 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      <input type="hidden" name="mode" value={mode} />
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{label}</h3>
        {justSaved && (
          <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
            <Check className="h-3.5 w-3.5" />
            Gespeichert
          </span>
        )}
      </div>
      {state?.error && state.mode === mode && (
        <div className="mt-3 rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {state.error}
        </div>
      )}
      <div className="mt-4 space-y-2">
        {ENRICHMENT_OPTIONS.map((opt) => (
          <label key={opt.key} className="flex items-start gap-2 text-sm">
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
      <button
        type="submit"
        disabled={pending}
        className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
      >
        {pending ? "Speichern…" : "Speichern"}
      </button>
    </form>
  );
}

export function SettingsManager({ fieldProfiles, enrichmentDefaults }: Props) {
  const [state, formAction, pending] = useActionState(saveFieldProfile, undefined);

  return (
    <div className="mt-6 space-y-8">
      {/* Standard-Anreicherungskriterien */}
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-bold">Standard-Anreicherungskriterien</h2>
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Legen Sie fest, welche Daten beim Anreichern standardmäßig gesucht werden — getrennt für Recruiting und Webentwicklung.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <EnrichmentDefaultsCard
            mode="recruiting"
            label="Recruiting"
            config={enrichmentDefaults.recruiting}
          />
          <EnrichmentDefaultsCard
            mode="webdev"
            label="Webentwicklung"
            config={enrichmentDefaults.webdev}
          />
        </div>
      </div>

      {/* Pflichtfeld-Profile */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        <h2 className="text-lg font-bold">Pflichtfeld-Profile</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Legen Sie fest, welche Felder ausgefüllt sein müssen, damit ein Lead als &quot;qualifiziert&quot; gilt.
        </p>

        {state?.error && (
          <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">{state.error}</div>
        )}

        <form action={formAction} className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Profilname</label>
            <input
              name="name"
              required
              placeholder="z.B. Standard oder Branche-GaLaBau"
              className="mt-1 w-64 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-[#232325] dark:text-gray-100 dark:placeholder-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Pflichtfelder</label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {hubspotFields.map((field) => (
                <label key={field.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="fields"
                    value={field.key}
                    defaultChecked={field.key === "company_name"}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  {field.label}
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_default" className="rounded border-gray-300 dark:border-gray-600" />
              Als Standard-Profil setzen
            </label>
          </div>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {pending ? "Speichern…" : "Profil speichern"}
          </button>
        </form>

        {fieldProfiles.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Bestehende Profile</h3>
            <div className="mt-2 space-y-2">
              {fieldProfiles.map((fp) => (
                <div
                  key={fp.id}
                  className="flex items-center justify-between rounded-md border border-gray-200 px-4 py-3 dark:border-[#2c2c2e]"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {fp.name}
                      {fp.is_default && (
                        <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                          Standard
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {fp.required_fields.join(", ")}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteFieldProfile(fp.id)}
                    className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
