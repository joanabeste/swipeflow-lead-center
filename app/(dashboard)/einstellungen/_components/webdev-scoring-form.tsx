"use client";

import { useActionState } from "react";
import type { WebdevScoringConfig } from "@/lib/types";
import { saveWebdevScoring } from "../actions";
import { Card, FormStatus, SubmitButton } from "./ui";

const WEBDEV_CHECKS: { key: keyof WebdevScoringConfig; label: string; hint?: string }[] = [
  { key: "check_ssl", label: "SSL-Zertifikat", hint: "Issue wenn keine HTTPS-Verbindung" },
  { key: "check_responsive", label: "Mobile / Responsive", hint: "Issue wenn kein Viewport/Media-Queries" },
  { key: "check_meta_tags", label: "Meta-Tags & Titel", hint: "Meta-Description und <title>" },
  { key: "check_alt_tags", label: "Alt-Texte für Bilder", hint: "Barrierefreiheit + SEO" },
  { key: "check_outdated_html", label: "Veraltete HTML-Tags", hint: "Flash, <font>, <center>, altes jQuery, Tabellen-Layout" },
];

const STRICTNESS_OPTIONS = [
  { value: "lax", label: "Locker", hint: "Nur offensichtlich veraltetes bewerten" },
  { value: "normal", label: "Normal", hint: "Ausgewogene Bewertung" },
  { value: "strict", label: "Streng", hint: "Heutige Standards als Maßstab" },
] as const;

export function WebdevScoringForm({ config }: { config: WebdevScoringConfig }) {
  const [state, formAction, pending] = useActionState(saveWebdevScoring, undefined);

  return (
    <Card>
      <form action={formAction}>
        <FormStatus state={state} />

        {/* Strenge */}
        <div>
          <label className="block text-sm font-medium">Strenge der Design-Bewertung</label>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Wie kritisch soll die KI Webdesigns bewerten?
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {STRICTNESS_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="cursor-pointer rounded-lg border border-gray-200 p-3 text-sm transition has-[:checked]:border-gray-900 has-[:checked]:bg-gray-900 has-[:checked]:text-white dark:border-[#2c2c2e] dark:has-[:checked]:border-white dark:has-[:checked]:bg-white dark:has-[:checked]:text-gray-900"
              >
                <input
                  type="radio"
                  name="strictness"
                  value={opt.value}
                  defaultChecked={config.strictness === opt.value}
                  className="sr-only"
                />
                <span className="block font-medium">{opt.label}</span>
                <span className="mt-0.5 block text-xs opacity-75">{opt.hint}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Fokus */}
        <div className="mt-6">
          <label htmlFor="design_focus" className="block text-sm font-medium">
            Design-Fokus <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Gib der KI spezifische Kriterien mit
          </p>
          <textarea
            id="design_focus"
            name="design_focus"
            defaultValue={config.design_focus ?? ""}
            rows={2}
            placeholder="z.B. Fokus auf moderne Typografie, Whitespace und klare CTAs"
            className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100 dark:placeholder-gray-500"
          />
        </div>

        {/* Schwellwerte */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="min_issues" className="block text-sm font-medium">
              Mindest-Issues
            </label>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Für Qualifizierung</p>
            <input
              id="min_issues"
              name="min_issues_to_qualify"
              type="number"
              min={1}
              max={20}
              defaultValue={config.min_issues_to_qualify}
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
            />
          </div>
          <div>
            <label htmlFor="slow_load" className="block text-sm font-medium">
              Mäßige Ladezeit
            </label>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Warnung ab Sek.</p>
            <input
              id="slow_load"
              name="slow_load_threshold_s"
              type="number"
              min={1}
              max={30}
              defaultValue={Math.round(config.slow_load_threshold_ms / 1000)}
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
            />
          </div>
          <div>
            <label htmlFor="very_slow_load" className="block text-sm font-medium">
              Langsame Ladezeit
            </label>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Kritisch ab Sek.</p>
            <input
              id="very_slow_load"
              name="very_slow_load_threshold_s"
              type="number"
              min={2}
              max={60}
              defaultValue={Math.round(config.very_slow_load_threshold_ms / 1000)}
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
            />
          </div>
        </div>

        {/* Import-Verhalten */}
        <div className="mt-6">
          <label className="block text-sm font-medium">Webdesign-Import</label>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Wie sollen Webdesign-Leads ohne Website behandelt werden?
          </p>
          <label
            className="mt-3 flex items-start gap-2.5 rounded-lg border border-gray-200 p-3.5 text-sm transition has-[:checked]:border-primary has-[:checked]:bg-primary/5 dark:border-[#2c2c2e] dark:has-[:checked]:border-primary/60 dark:has-[:checked]:bg-primary/10"
          >
            <input
              type="checkbox"
              name="allow_leads_without_website"
              defaultChecked={config.allow_leads_without_website}
              className="mt-0.5 rounded border-gray-300 dark:border-gray-600"
            />
            <span>
              <span className="block font-medium">Leads ohne Website zulassen</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">
                Aktiv: Webdesign-Leads ohne Website werden importiert. Inaktiv: sie werden als „cancelled“ markiert.
              </span>
            </span>
          </label>
        </div>

        {/* Aktive Checks */}
        <div className="mt-6">
          <label className="block text-sm font-medium">Welche Checks zählen als Issue?</label>
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {WEBDEV_CHECKS.map((check) => (
              <label
                key={check.key}
                className="flex items-start gap-2.5 rounded-lg border border-gray-200 p-3.5 text-sm transition has-[:checked]:border-primary has-[:checked]:bg-primary/5 dark:border-[#2c2c2e] dark:has-[:checked]:border-primary/60 dark:has-[:checked]:bg-primary/10"
              >
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

        <div className="mt-6">
          <SubmitButton pending={pending}>Webdesign-Bewertung speichern</SubmitButton>
        </div>
      </form>
    </Card>
  );
}
