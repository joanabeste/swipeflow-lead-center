"use client";

import { useActionState } from "react";
import {
  Plus, Trash2, Sparkles, Check, Globe, MapPin, Briefcase, ListChecks, Users, PhoneCall,
} from "lucide-react";
import { leadFields } from "@/lib/csv/lead-fields";
import type { RequiredFieldProfile, EnrichmentConfig, ServiceMode, WebdevScoringConfig, RecruitingScoringConfig, Profile, CustomLeadStatus } from "@/lib/types";
import type { HqLocation } from "@/lib/app-settings";
import { saveFieldProfile, deleteFieldProfile, saveEnrichmentDefaults, saveWebdevScoring, saveRecruitingScoring, saveHqLocation } from "./actions";
import { UserManager } from "../nutzer/user-manager";
import { CrmStatusManager } from "./crm-status-manager";
import { PhonemondoManager } from "./phonemondo-manager";

interface Props {
  fieldProfiles: RequiredFieldProfile[];
  enrichmentDefaults: Record<ServiceMode, EnrichmentConfig>;
  webdevScoring: WebdevScoringConfig;
  recruitingScoring: RecruitingScoringConfig;
  hq: HqLocation;
  profiles: Profile[];
  crmStatuses: CustomLeadStatus[];
  phonemondoStatus: { hasToken: boolean; hasSecret: boolean; baseUrl: string };
  phonemondoWebhookUrl: string;
  currentUserId: string;
}

// ─── Shared UI ─────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="mb-5">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      </div>
      {subtitle && (
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
      )}
    </header>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-6 dark:border-[#2c2c2e] dark:bg-[#1c1c1e] ${className}`}>
      {children}
    </div>
  );
}

function FormStatus({ state }: { state?: { error?: string; success?: boolean } }) {
  if (!state) return null;
  if (state.error) {
    return (
      <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
        {state.error}
      </div>
    );
  }
  if (state.success) {
    return (
      <div className="mb-4 inline-flex items-center gap-1.5 rounded-md bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 dark:bg-green-900/20 dark:text-green-400">
        <Check className="h-3.5 w-3.5" />
        Gespeichert
      </div>
    );
  }
  return null;
}

function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
    >
      {pending ? "Speichern…" : children}
    </button>
  );
}

// ─── HQ Location ───────────────────────────────────────────────

function HqLocationCard({ hq }: { hq: HqLocation }) {
  const [state, formAction, pending] = useActionState(saveHqLocation, undefined);

  return (
    <Card>
      <form action={formAction}>
        <FormStatus state={state} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="hq_label" className="block text-sm font-medium">Bezeichnung</label>
            <input
              id="hq_label"
              name="label"
              defaultValue={hq.label}
              placeholder="z.B. swipeflow GmbH"
              className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100 dark:placeholder-gray-500"
            />
          </div>
          <div>
            <label htmlFor="hq_address" className="block text-sm font-medium">Adresse</label>
            <input
              id="hq_address"
              name="address"
              defaultValue={hq.address}
              required
              placeholder="Straße + PLZ + Ort"
              className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100 dark:placeholder-gray-500"
            />
          </div>
        </div>
        <p className="mt-2.5 font-mono text-xs text-gray-400">
          {hq.lat.toFixed(4)}, {hq.lng.toFixed(4)}
        </p>
        <div className="mt-5">
          <SubmitButton pending={pending}>Standort speichern</SubmitButton>
        </div>
      </form>
    </Card>
  );
}

// ─── Enrichment Defaults ───────────────────────────────────────

type EnrichmentBoolKey = "contacts_management" | "contacts_hr" | "contacts_all" | "job_postings" | "career_page" | "company_details";

const ENRICHMENT_OPTIONS: { key: EnrichmentBoolKey; label: string; hint?: string }[] = [
  { key: "contacts_management", label: "Geschäftsführung & Management", hint: "GF, Inhaber, Vorstand" },
  { key: "contacts_hr", label: "HR-Verantwortliche", hint: "Personal, Recruiting, Ausbildung, Bewerbermanagement" },
  { key: "contacts_all", label: "Alle weiteren Ansprechpartner", hint: "Vertrieb, Support, sonstige" },
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

// ─── Recruiting Scoring ────────────────────────────────────────

function RecruitingScoringForm({ config }: { config: RecruitingScoringConfig }) {
  const [state, formAction, pending] = useActionState(saveRecruitingScoring, undefined);

  return (
    <Card>
      <form action={formAction}>
        <FormStatus state={state} />

        <div>
          <label htmlFor="min_jobs" className="block text-sm font-medium">
            Mindest-Stellenanzeigen für Qualifizierung
          </label>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Eine Firma muss beim Enrichment mindestens so viele offene Stellen haben. <span className="text-gray-400">0 = nicht erforderlich</span>
          </p>
          <input
            id="min_jobs"
            name="min_job_postings_to_qualify"
            type="number"
            min={0}
            max={50}
            defaultValue={config.min_job_postings_to_qualify}
            className="mt-2 w-32 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
          />
        </div>

        <div className="mt-6 space-y-3">
          <label className="flex items-start gap-2.5 rounded-lg border border-gray-200 p-3.5 text-sm transition has-[:checked]:border-primary has-[:checked]:bg-primary/5 dark:border-[#2c2c2e] dark:has-[:checked]:border-primary/60 dark:has-[:checked]:bg-primary/10">
            <input
              type="checkbox"
              name="require_contact_email"
              defaultChecked={config.require_contact_email}
              className="mt-0.5 rounded border-gray-300 dark:border-gray-600"
            />
            <span>
              <span className="block font-medium">E-Mail-Adresse beim Kontakt erforderlich</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">
                Qualifizierung nur, wenn mindestens ein Kontakt eine E-Mail hat.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2.5 rounded-lg border border-gray-200 p-3.5 text-sm transition has-[:checked]:border-primary has-[:checked]:bg-primary/5 dark:border-[#2c2c2e] dark:has-[:checked]:border-primary/60 dark:has-[:checked]:bg-primary/10">
            <input
              type="checkbox"
              name="require_hr_contact"
              defaultChecked={config.require_hr_contact}
              className="mt-0.5 rounded border-gray-300 dark:border-gray-600"
            />
            <span>
              <span className="block font-medium">HR-Kontakt erforderlich</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">
                Nur qualifizieren, wenn mindestens ein Kontakt als HR, Personal, Recruiting, Talent, People oder Ausbildung erkannt wird.
              </span>
            </span>
          </label>
        </div>

        <div className="mt-6">
          <SubmitButton pending={pending}>Recruiting-Bewertung speichern</SubmitButton>
        </div>
      </form>
    </Card>
  );
}

// ─── Webdev Scoring ────────────────────────────────────────────

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

function WebdevScoringForm({ config }: { config: WebdevScoringConfig }) {
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

// ─── Pflichtfeld-Profile ───────────────────────────────────────

function FieldProfilesCard({ profiles }: { profiles: RequiredFieldProfile[] }) {
  const [state, formAction, pending] = useActionState(saveFieldProfile, undefined);

  return (
    <div className="space-y-4">
      <Card>
        <form action={formAction} className="space-y-5">
          {state?.error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">{state.error}</div>
          )}
          <div>
            <label className="block text-sm font-medium">Profilname</label>
            <input
              name="name"
              required
              placeholder="z.B. Standard oder Branche-GaLaBau"
              className="mt-1.5 w-full max-w-md rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100 dark:placeholder-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Pflichtfelder</label>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
              {leadFields.map((field) => (
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
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_default" className="rounded border-gray-300 dark:border-gray-600" />
            Als Standard-Profil setzen
          </label>
          <div>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
            >
              <Plus className="h-4 w-4" />
              {pending ? "Speichern…" : "Profil speichern"}
            </button>
          </div>
        </form>
      </Card>

      {profiles.length > 0 && (
        <Card>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Bestehende Profile ({profiles.length})
          </h3>
          <div className="mt-3 divide-y divide-gray-100 dark:divide-[#2c2c2e]">
            {profiles.map((fp) => (
              <div key={fp.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium">
                    {fp.name}
                    {fp.is_default && (
                      <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        Standard
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {fp.required_fields.join(", ")}
                  </p>
                </div>
                <button
                  onClick={() => deleteFieldProfile(fp.id)}
                  className="rounded-md p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                  title="Profil löschen"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Main Settings Manager ─────────────────────────────────────

const SECTIONS = [
  { id: "standort", label: "Unser Standort", icon: MapPin },
  { id: "anreicherung", label: "Anreicherung", icon: Sparkles },
  { id: "crm-status", label: "CRM-Status", icon: PhoneCall },
  { id: "phonemondo", label: "PhoneMondo", icon: PhoneCall },
  { id: "recruiting-scoring", label: "Recruiting-Bewertung", icon: Briefcase },
  { id: "webdev-scoring", label: "Webdesign-Bewertung", icon: Globe },
  { id: "pflichtfelder", label: "Pflichtfelder", icon: ListChecks },
  { id: "nutzer", label: "Nutzer & Rollen", icon: Users },
] as const;

export function SettingsManager({
  fieldProfiles,
  enrichmentDefaults,
  webdevScoring,
  recruitingScoring,
  hq,
  profiles,
  crmStatuses,
  phonemondoStatus,
  phonemondoWebhookUrl,
  currentUserId,
}: Props) {
  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
      {/* Sticky Navigation */}
      <aside className="hidden lg:block">
        <nav className="sticky top-4 space-y-1">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-100"
            >
              <s.icon className="h-4 w-4" />
              {s.label}
            </a>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <div className="space-y-12 min-w-0">
        <section id="standort" className="scroll-mt-4">
          <SectionHeader
            icon={MapPin}
            title="Unser Standort"
            subtitle="Wird auf der Karte im Lead-Profil als Ausgangspunkt für die Entfernung genutzt."
          />
          <HqLocationCard hq={hq} />
        </section>

        <section id="anreicherung" className="scroll-mt-4">
          <SectionHeader
            icon={Sparkles}
            title="Standard-Anreicherungskriterien"
            subtitle="Welche Daten beim Anreichern standardmäßig gesucht werden — pro Service-Modus."
          />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <EnrichmentDefaultsCard mode="recruiting" label="Recruiting" config={enrichmentDefaults.recruiting} />
            <EnrichmentDefaultsCard mode="webdev" label="Webentwicklung" config={enrichmentDefaults.webdev} />
          </div>
        </section>

        <section id="crm-status" className="scroll-mt-4">
          <SectionHeader
            icon={PhoneCall}
            title="CRM-Status / Vertriebsphasen"
            subtitle="Frei konfigurierbare Status-Labels für den Sales-Workflow im CRM. Leads bekommen beim Qualifizieren automatisch den Status 'Todo'."
          />
          <CrmStatusManager statuses={crmStatuses} />
        </section>

        <section id="phonemondo" className="scroll-mt-4">
          <SectionHeader
            icon={PhoneCall}
            title="PhoneMondo"
            subtitle="Click-to-Call im CRM. Server-Integration + Durchwahlen pro Nutzer."
          />
          <PhonemondoManager
            status={phonemondoStatus}
            profiles={profiles}
            webhookUrl={phonemondoWebhookUrl}
          />
        </section>

        <section id="recruiting-scoring" className="scroll-mt-4">
          <SectionHeader
            icon={Briefcase}
            title="Recruiting-Bewertung"
            subtitle="Wann soll ein Lead im Recruiting-Modus automatisch als qualifiziert gelten?"
          />
          <RecruitingScoringForm config={recruitingScoring} />
        </section>

        <section id="webdev-scoring" className="scroll-mt-4">
          <SectionHeader
            icon={Globe}
            title="Webdesign-Bewertung"
            subtitle="Strenge der KI-Bewertung und welche Kriterien als Issue zählen."
          />
          <WebdevScoringForm config={webdevScoring} />
        </section>

        <section id="pflichtfelder" className="scroll-mt-4">
          <SectionHeader
            icon={ListChecks}
            title="Pflichtfeld-Profile"
            subtitle="Welche Felder müssen gefüllt sein, damit ein Lead qualifiziert werden kann?"
          />
          <FieldProfilesCard profiles={fieldProfiles} />
        </section>

        <section id="nutzer" className="scroll-mt-4">
          <SectionHeader
            icon={Users}
            title="Nutzer & Rollen"
            subtitle="Benutzerkonten und deren Berechtigungen verwalten."
          />
          <UserManager profiles={profiles} currentUserId={currentUserId} />
        </section>
      </div>
    </div>
  );
}
