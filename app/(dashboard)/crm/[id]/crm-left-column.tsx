"use client";

import { useActionState } from "react";
import dynamic from "next/dynamic";
import { Briefcase, Mail, Phone, MapPin, User, ExternalLink, Save } from "lucide-react";
import type { Lead, LeadContact, LeadJobPosting, LeadEnrichment } from "@/lib/types";
import type { HqLocation } from "@/lib/app-settings";
import { isHrContact } from "@/lib/recruiting/hr-contact";
import { haversineKm, distanceCategory } from "@/lib/geo/distance";
import { updateLead } from "../../leads/actions";

const LeadMap = dynamic(() => import("../../leads/lead-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[150px] items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-xs text-gray-400 dark:border-[#2c2c2e] dark:bg-[#232325]">
      Karte wird geladen…
    </div>
  ),
});

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
  career_page_url: "Karriereseite",
};

const EDIT_FIELDS = Object.keys(fieldLabels);

interface Props {
  lead: Lead;
  contacts: LeadContact[];
  jobs: LeadJobPosting[];
  latestEnrichment: LeadEnrichment | null;
  hq: HqLocation;
}

export function CrmLeftColumn({ lead, contacts, jobs, latestEnrichment, hq }: Props) {
  async function handleSubmit(
    _prev: { error?: string; success?: boolean } | undefined,
    formData: FormData,
  ) {
    const updates: Record<string, string | null> = {};
    for (const key of EDIT_FIELDS) {
      const v = formData.get(key) as string;
      if (v !== (lead[key as keyof Lead] ?? "")) {
        updates[key] = v || null;
      }
    }
    if (Object.keys(updates).length === 0) return { success: true };
    return updateLead(lead.id, updates);
  }
  const [state, formAction, pending] = useActionState(handleSubmit, undefined);

  const hrContacts = contacts.filter((c) => isHrContact(c.role));
  const otherContacts = contacts.filter((c) => !isHrContact(c.role));
  const orderedContacts = [...hrContacts, ...otherContacts];

  return (
    <>
      {/* Firmen-Briefing */}
      <Card>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Firma
        </h2>
        <h3 className="mt-2 text-lg font-bold tracking-tight">{lead.company_name}</h3>
        {lead.domain && (
          <a
            href={lead.website ?? `https://${lead.domain}`}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {lead.domain}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
        <dl className="mt-3 space-y-1.5 text-sm">
          {lead.phone && (
            <Row icon={Phone} value={<a className="text-primary hover:underline" href={`tel:${lead.phone}`}>{lead.phone}</a>} />
          )}
          {lead.email && (
            <Row icon={Mail} value={<a className="text-primary hover:underline" href={`mailto:${lead.email}`}>{lead.email}</a>} />
          )}
          {(lead.street || lead.city) && (
            <Row
              icon={MapPin}
              value={[lead.street, lead.zip && lead.city ? `${lead.zip} ${lead.city}` : lead.city].filter(Boolean).join(", ")}
            />
          )}
          {lead.industry && <Row icon={Briefcase} value={lead.industry} />}
          {lead.company_size && <Row icon={User} value={`${lead.company_size} Mitarbeiter`} />}
        </dl>
        {latestEnrichment?.completed_at && (
          <p className="mt-3 text-[11px] text-gray-400">
            Angereichert: {new Date(latestEnrichment.completed_at).toLocaleDateString("de-DE")}
          </p>
        )}
      </Card>

      {/* Kontakte */}
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Ansprechpartner ({contacts.length})
          </h2>
          {hrContacts.length > 0 && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
              {hrContacts.length} HR
            </span>
          )}
        </div>
        {contacts.length === 0 ? (
          <p className="mt-2 text-sm text-gray-400">Keine Kontakte.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {orderedContacts.map((c) => {
              const isHr = isHrContact(c.role);
              return (
                <li
                  key={c.id}
                  className={`rounded-md border p-2 ${
                    isHr
                      ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-900/10"
                      : "border-gray-100 dark:border-[#2c2c2e]"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium">{c.name}</p>
                    {isHr && (
                      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        HR
                      </span>
                    )}
                  </div>
                  {c.role && <p className="text-xs text-gray-500 dark:text-gray-400">{c.role}</p>}
                  <div className="mt-0.5 space-y-0.5 text-xs">
                    {c.email && (
                      <a className="block truncate text-primary hover:underline" href={`mailto:${c.email}`}>
                        {c.email}
                      </a>
                    )}
                    {c.phone && (
                      <a className="block truncate text-primary hover:underline" href={`tel:${c.phone}`}>
                        {c.phone}
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Offene Stellen */}
      {jobs.length > 0 && (
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Offene Stellen ({jobs.length})
            </h2>
            {latestEnrichment?.career_page_url && (
              <a
                href={latestEnrichment.career_page_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                Karriereseite
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
          <ul className="mt-2 space-y-1.5">
            {jobs.map((j) => (
              <li key={j.id} className="rounded-md border border-gray-100 p-2 dark:border-[#2c2c2e]">
                <div className="flex items-start justify-between gap-1">
                  <p className="text-sm font-medium leading-tight">{j.title}</p>
                  {j.url && (
                    <a href={j.url} target="_blank" rel="noreferrer" className="shrink-0 text-primary">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                {j.location && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{j.location}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Standort */}
      {lead.latitude != null && lead.longitude != null && (
        <Card>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Standort
          </h2>
          {(() => {
            const km = haversineKm({ lat: hq.lat, lng: hq.lng }, { lat: lead.latitude!, lng: lead.longitude! });
            const cat = distanceCategory(km);
            const tones: Record<typeof cat.tone, string> = {
              local: "text-green-600 dark:text-green-400",
              regional: "text-yellow-600 dark:text-yellow-400",
              far: "text-gray-500",
            };
            return (
              <>
                <div className="mt-2">
                  <LeadMap hq={{ lat: hq.lat, lng: hq.lng }} lead={{ lat: lead.latitude!, lng: lead.longitude! }} />
                </div>
                <p className="mt-2 text-sm">
                  <span className="font-bold">{Math.round(km)} km</span>
                  <span className={`ml-2 text-xs ${tones[cat.tone]}`}>{cat.label}</span>
                </p>
              </>
            );
          })()}
        </Card>
      )}

      {/* Stammdaten bearbeiten */}
      <Card>
        <details>
          <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
            Stammdaten bearbeiten ▾
          </summary>
          <form action={formAction} className="mt-3 space-y-2">
            {EDIT_FIELDS.map((k) => (
              <label key={k} className="block text-xs">
                <span className="text-gray-500 dark:text-gray-400">{fieldLabels[k]}</span>
                <input
                  name={k}
                  defaultValue={(lead[k as keyof Lead] as string) ?? ""}
                  className="mt-0.5 w-full rounded-md border border-gray-200 bg-white p-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#161618]"
                />
              </label>
            ))}
            {state && "error" in state && state.error && (
              <p className="text-xs text-red-600">{state.error}</p>
            )}
            {state && "success" in state && state.success && (
              <p className="text-xs text-green-600">Gespeichert.</p>
            )}
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              <Save className="h-3 w-3" />
              {pending ? "Speichern…" : "Speichern"}
            </button>
          </form>
        </details>
      </Card>
    </>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      {children}
    </div>
  );
}

function Row({
  icon: Icon, value,
}: { icon: React.ComponentType<{ className?: string }>; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
      <div className="min-w-0 break-words">{value}</div>
    </div>
  );
}
