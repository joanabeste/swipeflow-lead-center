"use client";

import { useActionState } from "react";
import { Plus, Trash2, Sparkles, Check, Globe } from "lucide-react";
import { hubspotFields } from "@/lib/hubspot/schema";
import type { RequiredFieldProfile, EnrichmentConfig, ServiceMode, WebdevScoringConfig } from "@/lib/types";
import { saveFieldProfile, deleteFieldProfile, saveEnrichmentDefaults, saveWebdevScoring } from "./actions";

interface Props {
  fieldProfiles: RequiredFieldProfile[];
  enrichmentDefaults: Record<ServiceMode, EnrichmentConfig>;
  webdevScoring: WebdevScoringConfig;
}

const WEBDEV_CHECKS: { key: keyof WebdevScoringConfig; label: string; hint?: string }[] = [
  { key: "check_ssl", label: "SSL-Zertifikat", hint: "Issue wenn keine HTTPS-Verbindung" },
  { key: "check_responsive", label: "Mobile / Responsive", hint: "Issue wenn kein Viewport/Media-Queries" },
  { key: "check_meta_tags", label: "Meta-Tags & Titel", hint: "Meta-Description und <title>" },
  { key: "check_alt_tags", label: "Alt-Texte für Bilder", hint: "Barrierefreiheit + SEO" },
  { key: "check_outdated_html", label: "Veraltete HTML-Tags", hint: "Flash, <font>, <center>, altes jQuery, Tabellen-Layout" },
];

function WebdevScoringForm({ config }: { config: WebdevScoringConfig }) {
  const [state, formAction, pending] = useActionState(saveWebdevScoring, undefined);

  return (
    <form action={formAction} className="rounded-lg border border-gray-200 bg-white p-6 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-bold">Webdesign-Bewertung</h2>
      </div>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Steuere, wie streng die KI Websites bewertet und welche Kriterien als Issue zählen.
      </p>

      {state?.error && (
        <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {state.error}
        </div>
      )}
      {state?.success && (
        <div className="mt-3 inline-flex items-center gap-1 rounded-md bg-green-50 px-3 py-1.5 text-xs text-green-700 dark:bg-green-900/20 dark:text-green-400">
          <Check className="h-3.5 w-3.5" />
          Gespeichert
        </div>
      )}

      {/* Strenge */}
      <div className="mt-5">
        <label className="block text-sm font-medium">Strenge der Design-Bewertung</label>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Wie kritisch soll die KI Webdesign bewerten?
        </p>
        <div className="mt-2 inline-flex rounded-md border border-gray-300 dark:border-[#2c2c2e]">
          {([
            { value: "lax", label: "Locker", hint: "Nur wirklich altes als 'veraltet'" },
            { value: "normal", label: "Normal", hint: "Ausgewogene Bewertung" },
            { value: "strict", label: "Streng", hint: "Heutige Standards als Maßstab" },
          ] as const).map((opt) => (
            <label
              key={opt.value}
              className="relative flex cursor-pointer flex-col gap-0.5 border-r border-gray-200 px-4 py-2 text-xs last:border-r-0 has-[:checked]:bg-gray-900 has-[:checked]:text-white dark:border-[#2c2c2e] dark:has-[:checked]:bg-white dark:has-[:checked]:text-gray-900"
              title={opt.hint}
            >
              <input
                type="radio"
                name="strictness"
                value={opt.value}
                defaultChecked={config.strictness === opt.value}
                className="sr-only"
              />
              <span className="font-medium">{opt.label}</span>
              <span className="text-[10px] opacity-70">{opt.hint}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Fokus */}
      <div className="mt-5">
        <label htmlFor="design_focus" className="block text-sm font-medium">
          Design-Fokus (optional)
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Gib der KI spezifische Kriterien mit — z.B. &quot;Achte besonders auf Typografie und Whitespace&quot;
        </p>
        <textarea
          id="design_focus"
          name="design_focus"
          defaultValue={config.design_focus ?? ""}
          rows={2}
          placeholder="z.B. Fokus auf moderne Typografie, Whitespace und klare CTAs"
          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100 dark:placeholder-gray-500"
        />
      </div>

      {/* Qualifizierungs-Schwelle + Ladezeit */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="min_issues" className="block text-sm font-medium">
            Mindest-Issues für Qualifizierung
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400">Ab wann Lead qualifiziert</p>
          <input
            id="min_issues"
            name="min_issues_to_qualify"
            type="number"
            min={1}
            max={20}
            defaultValue={config.min_issues_to_qualify}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
          />
        </div>
        <div>
          <label htmlFor="slow_load" className="block text-sm font-medium">
            Mäßige Ladezeit ab (Sek.)
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400">Warnung</p>
          <input
            id="slow_load"
            name="slow_load_threshold_s"
            type="number"
            min={1}
            max={30}
            defaultValue={Math.round(config.slow_load_threshold_ms / 1000)}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
          />
        </div>
        <div>
          <label htmlFor="very_slow_load" className="block text-sm font-medium">
            Langsame Ladezeit ab (Sek.)
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400">Kritisch</p>
          <input
            id="very_slow_load"
            name="very_slow_load_threshold_s"
            type="number"
            min={2}
            max={60}
            defaultValue={Math.round(config.very_slow_load_threshold_ms / 1000)}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
          />
        </div>
      </div>

      {/* Aktive Checks */}
      <div className="mt-5">
        <label className="block text-sm font-medium">Welche Checks sollen als Issue zählen?</label>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {WEBDEV_CHECKS.map((check) => (
            <label key={check.key} className="flex items-start gap-2 rounded-md border border-gray-200 p-3 text-sm dark:border-[#2c2c2e]">
              <input
                type="checkbox"
                name={check.key}
                defaultChecked={config[check.key] as boolean}
                className="mt-0.5 rounded border-gray-300 dark:border-gray-600"
              />
              <span>
                <span className="block font-medium">{check.label}</span>
                {check.hint && (
                  <span className="block text-xs text-gray-500 dark:text-gray-400">{check.hint}</span>
                )}
              </span>
            </label>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
      >
        {pending ? "Speichern…" : "Webdesign-Bewertung speichern"}
      </button>
    </form>
  );
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

export function SettingsManager({ fieldProfiles, enrichmentDefaults, webdevScoring }: Props) {
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

      {/* Webdesign-Bewertung */}
      <WebdevScoringForm config={webdevScoring} />

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
