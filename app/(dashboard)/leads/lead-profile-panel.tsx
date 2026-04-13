"use client";

import { useState, useTransition } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Loader2,
  User,
  Mail,
  Phone,
  ExternalLink,
  Briefcase,
  MapPin,
  Merge,
} from "lucide-react";
import type { Lead, LeadChange, LeadContact, LeadJobPosting, LeadEnrichment, LeadStatus } from "@/lib/types";
import { updateLead, findSimilarLeads, mergeLeads } from "./actions";
import { enrichLeadAction } from "./enrichment-actions";

const statusOptions: { value: string; label: string; color: string }[] = [
  { value: "imported", label: "Importiert", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  { value: "filtered", label: "Gefiltert", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  { value: "cancelled", label: "Ausgeschlossen", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  { value: "enrichment_pending", label: "Anreicherung", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  { value: "enriched", label: "Angereichert", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  { value: "qualified", label: "Qualifiziert", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  { value: "exported", label: "Exportiert", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
];

const fieldLabels: Record<string, string> = {
  company_name: "Firmenname",
  domain: "Domain",
  phone: "Telefon",
  email: "E-Mail",
  street: "Straße",
  city: "Ort",
  zip: "PLZ",
  state: "Bundesland",
  country: "Land",
  industry: "Branche",
  company_size: "Unternehmensgröße",
  legal_form: "Rechtsform",
  register_id: "Handelsregister-Nr.",
  website: "Website",
  description: "Beschreibung",
  status: "Status",
};

interface Props {
  lead: Lead;
  changes: LeadChange[];
  contacts: LeadContact[];
  jobPostings: LeadJobPosting[];
  latestEnrichment: LeadEnrichment | null;
}

export function LeadProfilePanel({ lead, changes, contacts, jobPostings, latestEnrichment }: Props) {
  const router = useRouter();
  const [currentStatus, setCurrentStatus] = useState<LeadStatus>(lead.status);
  const [statusPending, startStatusTransition] = useTransition();
  const [enrichPending, startEnrichTransition] = useTransition();
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [enrichSuccess, setEnrichSuccess] = useState(false);
  const [similarLeads, setSimilarLeads] = useState<{ id: string; company_name: string; domain: string | null; city: string | null; status: string }[]>([]);
  const [similarLoaded, setSimilarLoaded] = useState(false);
  const [mergePending, startMergeTransition] = useTransition();

  const hasWebsite = !!(lead.website || lead.domain);

  function handleStatusChange(newStatus: LeadStatus) {
    setCurrentStatus(newStatus);
    startStatusTransition(async () => {
      await updateLead(lead.id, { status: newStatus });
    });
  }

  function handleEnrich() {
    setEnrichError(null);
    setEnrichSuccess(false);
    startEnrichTransition(async () => {
      const result = await enrichLeadAction(lead.id);
      if (result.error) {
        setEnrichError(result.error);
      } else {
        setEnrichSuccess(true);
      }
    });
  }

  async function handleSubmit(
    _prev: { error?: string; success?: boolean } | undefined,
    formData: FormData,
  ) {
    const updates: Record<string, string | null> = {};
    for (const key of Object.keys(fieldLabels)) {
      const value = formData.get(key) as string | null;
      updates[key] = value || null;
    }
    return updateLead(lead.id, updates);
  }

  const [state, formAction, pending] = useActionState(handleSubmit, undefined);

  const editableFields = Object.keys(fieldLabels).filter((k) => k !== "status");
  const statusInfo = statusOptions.find((s) => s.value === currentStatus) ?? statusOptions[0];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/leads")}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück zur Liste
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={handleEnrich}
            disabled={enrichPending || !hasWebsite}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
            title={!hasWebsite ? "Keine Website/Domain vorhanden" : undefined}
          >
            {enrichPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {enrichPending ? "Anreichern…" : contacts.length > 0 ? "Erneut anreichern" : "Anreichern"}
          </button>
          <select
            value={currentStatus}
            onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
            disabled={statusPending}
            className={`rounded-full px-3 py-1.5 text-xs font-medium border-0 focus:ring-2 focus:ring-primary focus:outline-none ${statusInfo.color} ${statusPending ? "opacity-50" : ""}`}
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Firmenname + Erstellt */}
      <div className="mt-4">
        <h1 className="text-2xl font-bold tracking-tight">{lead.company_name}</h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          Erstellt: {new Date(lead.created_at).toLocaleDateString("de-DE")}
          {latestEnrichment?.status === "completed" && (
            <> · Angereichert: {new Date(latestEnrichment.completed_at!).toLocaleDateString("de-DE")}</>
          )}
        </p>
      </div>

      {/* Banner: Cancel / Blacklist / Enrich-Fehler */}
      {(lead.cancel_reason || (lead.blacklist_hit && lead.blacklist_reason)) && (
        <div className="mt-4 flex items-start gap-3 rounded-md border border-orange-200 bg-orange-50 p-3 dark:border-orange-800 dark:bg-orange-900/20">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-orange-600 dark:text-orange-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-orange-800 dark:text-orange-300">
              {lead.status === "cancelled" ? "Automatisch ausgeschlossen" : "Blacklist-Treffer"}
            </p>
            <p className="mt-0.5 text-xs text-orange-700 dark:text-orange-400">
              {lead.cancel_reason ?? lead.blacklist_reason}
            </p>
          </div>
          {(lead.status === "cancelled" || lead.status === "filtered") && (
            <button
              onClick={() => handleStatusChange("imported")}
              disabled={statusPending}
              className="inline-flex items-center gap-1 rounded-md border border-orange-300 px-2.5 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-orange-900/30"
            >
              <RotateCcw className="h-3 w-3" />
              Trotzdem fortfahren
            </button>
          )}
        </div>
      )}

      {enrichError && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">{enrichError}</div>
      )}
      {enrichSuccess && (
        <div className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">Anreicherung abgeschlossen. Seite neu laden für aktualisierte Daten.</div>
      )}

      {state?.error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">{state.error}</div>
      )}
      {state?.success && (
        <div className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">Gespeichert.</div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Linke Spalte: Firmendaten + Kontakte + Stellen */}
        <div className="space-y-6 lg:col-span-2">

          {/* Stammdaten */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
            <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">Stammdaten</h2>
            <form action={formAction} className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {editableFields.map((key) => (
                  <div key={key} className={key === "description" ? "sm:col-span-2" : ""}>
                    <label htmlFor={key} className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                      {fieldLabels[key]}
                    </label>
                    {key === "description" ? (
                      <textarea
                        id={key}
                        name={key}
                        defaultValue={lead[key as keyof Lead] as string ?? ""}
                        rows={2}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                      />
                    ) : (
                      <input
                        id={key}
                        name={key}
                        type="text"
                        defaultValue={lead[key as keyof Lead] as string ?? ""}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {pending ? "Speichern…" : "Speichern"}
                </button>
              </div>
            </form>
          </div>

          {/* Ansprechpartner */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400">
                <User className="h-3.5 w-3.5" />
                Ansprechpartner ({contacts.length})
              </h2>
            </div>
            {contacts.length === 0 ? (
              <p className="mt-3 text-sm text-gray-400">
                {hasWebsite ? "Noch keine Kontakte — Lead anreichern um Kontakte zu finden." : "Keine Website vorhanden."}
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {contacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="flex items-start justify-between rounded-md border border-gray-100 p-3 dark:border-[#2c2c2e]"
                  >
                    <div>
                      <p className="text-sm font-medium">{contact.name}</p>
                      {contact.role && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">{contact.role}</p>
                      )}
                      <div className="mt-1 flex flex-wrap gap-3 text-xs">
                        {contact.email && (
                          <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                            <Mail className="h-3 w-3" />
                            {contact.email}
                          </a>
                        )}
                        {contact.phone && (
                          <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                            <Phone className="h-3 w-3" />
                            {contact.phone}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Offene Stellen */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400">
                <Briefcase className="h-3.5 w-3.5" />
                Offene Stellen ({jobPostings.length})
              </h2>
              {latestEnrichment?.career_page_url && (
                <a
                  href={latestEnrichment.career_page_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Karriereseite
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            {jobPostings.length === 0 ? (
              <p className="mt-3 text-sm text-gray-400">
                {hasWebsite ? "Keine Stellen gefunden." : "Keine Website vorhanden."}
              </p>
            ) : (
              <div className="mt-3 space-y-1.5">
                {jobPostings.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2 dark:border-[#2c2c2e]"
                  >
                    <div>
                      <p className="text-sm font-medium">{job.title}</p>
                      {job.location && (
                        <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          <MapPin className="h-3 w-3" />
                          {job.location}
                        </p>
                      )}
                    </div>
                    {job.url && (
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary-dark"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Rechte Spalte */}
        <div className="space-y-4">
          {/* Duplikate / Merge */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400">
                <Merge className="h-3.5 w-3.5" />
                Duplikate
              </h2>
              {!similarLoaded && (
                <button
                  onClick={async () => {
                    const results = await findSimilarLeads(lead.id);
                    setSimilarLeads(results);
                    setSimilarLoaded(true);
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  Prüfen
                </button>
              )}
            </div>
            {similarLoaded && similarLeads.length === 0 && (
              <p className="mt-2 text-sm text-gray-400">Keine Duplikate gefunden.</p>
            )}
            {similarLeads.length > 0 && (
              <div className="mt-2 space-y-2">
                {similarLeads.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-md border border-gray-100 p-2 dark:border-[#2c2c2e]">
                    <div>
                      <p className="text-sm font-medium">{s.company_name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{s.domain ?? s.city ?? "–"}</p>
                    </div>
                    <button
                      onClick={() => {
                        if (confirm(`"${s.company_name}" in diesen Lead zusammenführen? Der andere Lead wird gelöscht.`)) {
                          startMergeTransition(async () => {
                            await mergeLeads(lead.id, s.id);
                            setSimilarLeads((prev) => prev.filter((p) => p.id !== s.id));
                          });
                        }
                      }}
                      disabled={mergePending}
                      className="rounded bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
                    >
                      Zusammenführen
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Änderungshistorie */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
            <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">Änderungshistorie</h2>
            {changes.length === 0 ? (
              <p className="mt-2 text-sm text-gray-400">Noch keine Änderungen.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {changes.map((change) => (
                  <li key={change.id} className="border-l-2 border-gray-200 pl-3 text-sm dark:border-gray-700">
                    <p className="font-medium text-gray-700 dark:text-gray-300">
                      {fieldLabels[change.field_name] ?? change.field_name}
                    </p>
                    <p className="text-gray-500 dark:text-gray-400">
                      <span className="line-through">{change.old_value ?? "–"}</span> → {change.new_value ?? "–"}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {new Date(change.created_at).toLocaleString("de-DE")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
