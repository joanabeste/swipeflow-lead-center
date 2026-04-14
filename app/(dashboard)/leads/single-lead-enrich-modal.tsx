"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Sparkles, Target, Loader2 } from "lucide-react";
import type { EnrichmentConfig, CompanyDetailField, ServiceMode } from "@/lib/types";
import { DEFAULT_ENRICHMENT_CONFIG } from "@/lib/types";
import { enrichLeadAction } from "./enrichment-actions";
import { useToastContext } from "../toast-provider";

const TOGGLES: { key: keyof Pick<
  EnrichmentConfig,
  "contacts_management" | "contacts_hr" | "contacts_all" | "job_postings" | "career_page" | "company_details"
>; label: string; desc: string }[] = [
  { key: "contacts_management", label: "Geschäftsführung & Management", desc: "GF, Inhaber, Vorstand" },
  { key: "contacts_hr", label: "HR-Verantwortliche", desc: "Personal, Recruiting, Ausbildung, Bewerbung" },
  { key: "contacts_all", label: "Alle weiteren Ansprechpartner", desc: "Vertrieb, Support, Sonstige" },
  { key: "job_postings", label: "Stellenanzeigen", desc: "Offene Positionen + Links" },
  { key: "career_page", label: "Karriereseiten-URL", desc: "Link zur Karriereseite finden" },
  { key: "company_details", label: "Firmendaten", desc: "Größe, Adresse, Rechtsform usw." },
];

const COMPANY_FIELDS: { key: CompanyDetailField; label: string }[] = [
  { key: "phone", label: "Telefon" },
  { key: "email", label: "E-Mail" },
  { key: "address", label: "Adresse (Straße, PLZ, Ort, Bundesland)" },
  { key: "legal_form", label: "Rechtsform" },
  { key: "register_id", label: "Handelsregister-Nr." },
  { key: "company_size", label: "Unternehmensgröße" },
  { key: "industry", label: "Branche / Fachgebiete" },
  { key: "founding_year", label: "Gründungsjahr" },
];

const PRESETS: { label: string; desc: string; query: string }[] = [
  { label: "HR-Kontakt", desc: "Suche gezielt nach Personal-Verantwortlichem", query: "Finde den Namen und die E-Mail des HR-/Personal-/Recruiting-Verantwortlichen. Auch Ausbildungsleitung zählt." },
  { label: "Ausbildungsplätze", desc: "Ausbildung / Duales Studium / Werkstudent", query: "Fokus auf Ausbildung, Duales Studium, Werkstudent, Praktikum und Trainee. Alle diese Positionen als job_postings erfassen, auch wenn nur Beschreibungen ohne explizite (m/w/d)-Kennzeichnung." },
  { label: "Impressum-Daten", desc: "Rechtsform, HRB, Geschäftsführer", query: "Aus dem Impressum: Rechtsform (GmbH/AG/UG…), Handelsregister-Nr. inkl. Amtsgericht, Geschäftsführer mit vollem Namen, vollständige Adresse. Diese Angaben müssen aus dem Impressum stammen, nicht aus anderen Seiten." },
  { label: "Gründungsjahr", desc: "Wann wurde die Firma gegründet?", query: "Suche das Gründungsjahr der Firma. Typische Indikatoren: 'seit 19XX', 'gegründet 19XX/20XX', Jahreszahl in der Firmengeschichte oder Traditionsseite." },
];

interface Props {
  leadId: string;
  leadName: string;
  defaultConfig: EnrichmentConfig;
  serviceMode: ServiceMode;
  onClose: () => void;
}

export function SingleLeadEnrichModal({ leadId, leadName, defaultConfig, serviceMode, onClose }: Props) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [config, setConfig] = useState<EnrichmentConfig>({
    ...DEFAULT_ENRICHMENT_CONFIG,
    ...defaultConfig,
  });
  const [fieldsOnly, setFieldsOnly] = useState<boolean>(
    !!defaultConfig.company_details_fields && defaultConfig.company_details_fields.length > 0,
  );
  const [selectedFields, setSelectedFields] = useState<CompanyDetailField[]>(
    defaultConfig.company_details_fields ?? [],
  );
  const [focusQuery, setFocusQuery] = useState<string>("");

  function toggleField(f: CompanyDetailField) {
    setSelectedFields((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  }

  function start() {
    setError(null);
    const finalConfig: EnrichmentConfig = {
      ...config,
      company_details: config.company_details && (!fieldsOnly || selectedFields.length > 0),
      company_details_fields: fieldsOnly && selectedFields.length > 0 ? selectedFields : undefined,
      focus_query: focusQuery.trim() || undefined,
    };
    startTransition(async () => {
      const res = await enrichLeadAction(leadId, finalConfig, serviceMode);
      if (res.error) {
        setError(res.error);
        addToast(res.error, "error");
      } else {
        addToast("Anreicherung abgeschlossen", "success");
        onClose();
        router.refresh();
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-[#1c1c1e]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-[#2c2c2e]">
          <div>
            <h2 className="text-lg font-semibold">Gezielte Anreicherung</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">{leadName}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-6">
          {/* Was suchen? */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Was soll gesucht werden?
            </h3>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {TOGGLES.map((t) => (
                <label
                  key={t.key}
                  className="flex items-start gap-2 rounded-md border border-gray-200 p-2.5 text-sm hover:border-primary/40 dark:border-[#2c2c2e]"
                >
                  <input
                    type="checkbox"
                    checked={config[t.key]}
                    onChange={(e) => setConfig({ ...config, [t.key]: e.target.checked })}
                    className="mt-0.5 rounded border-gray-300 dark:border-gray-600"
                  />
                  <div className="min-w-0">
                    <p className="font-medium">{t.label}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </section>

          {/* Firmendaten-Feld-Auswahl */}
          {config.company_details && (
            <section>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={fieldsOnly}
                  onChange={(e) => setFieldsOnly(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                <span className="font-medium">Nur bestimmte Firmendaten-Felder</span>
              </label>
              {fieldsOnly && (
                <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-md border border-gray-200 bg-gray-50/50 p-3 dark:border-[#2c2c2e] dark:bg-[#161618]/50">
                  {COMPANY_FIELDS.map((f) => (
                    <label key={f.key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedFields.includes(f.key)}
                        onChange={() => toggleField(f.key)}
                        className="rounded border-gray-300 dark:border-gray-600"
                      />
                      {f.label}
                    </label>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Focus-Query mit Presets */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <Target className="mr-1 inline-block h-3 w-3" />
              Spezifischer Fokus (optional)
            </h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Zusätzlicher Hinweis an die KI. Macht die Suche präziser — z.B. &bdquo;Gründungsjahr aus
              Impressum&ldquo; oder &bdquo;HR-Kontakt für Bewerbungen auf der Karriereseite&ldquo;.
            </p>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => setFocusQuery(focusQuery === p.query ? "" : p.query)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition ${
                    focusQuery === p.query
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-gray-200 text-gray-600 hover:border-primary/40 dark:border-[#2c2c2e] dark:text-gray-400"
                  }`}
                  title={p.desc}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <textarea
              value={focusQuery}
              onChange={(e) => setFocusQuery(e.target.value)}
              rows={3}
              placeholder="z.B.: Finde den HR-Verantwortlichen mit Telefonnummer, und bestätige das Gründungsjahr aus dem Impressum."
              className="mt-2 w-full resize-none rounded-md border border-gray-200 bg-white p-2 text-sm dark:border-[#2c2c2e] dark:bg-[#161618]"
            />
          </section>

          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-6 py-4 dark:border-[#2c2c2e]">
          <p className="text-xs text-gray-400">
            Vorhandene BA-Stellen und manuell angelegte Kontakte bleiben erhalten.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
            >
              Abbrechen
            </button>
            <button
              onClick={start}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {pending ? "Läuft…" : "Jetzt anreichern"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
