"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Briefcase, Mail, Phone, MapPin, User, ExternalLink, Save, Plus, X, Pencil, Trash2,
} from "lucide-react";
import type { Lead, LeadContact, LeadJobPosting, LeadEnrichment } from "@/lib/types";
import type { HqLocation } from "@/lib/app-settings";
import { isHrContact } from "@/lib/recruiting/hr-contact";
import { haversineKm, distanceCategory } from "@/lib/geo/distance";
import { updateLead } from "../../leads/actions";
import { useToastContext } from "../../toast-provider";
import {
  addContact, updateContact, deleteContact,
  addJobPosting, deleteJobPosting,
} from "../actions";

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

      {/* Kontakte — editierbar */}
      <ContactsCard leadId={lead.id} contacts={contacts} />

      {/* Offene Stellen — editierbar */}
      <JobsCard leadId={lead.id} jobs={jobs} careerPageUrl={latestEnrichment?.career_page_url ?? null} />

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

// ─── Kontakte-Card ────────────────────────────────────────────

function ContactsCard({ leadId, contacts }: { leadId: string; contacts: LeadContact[] }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const hrContacts = contacts.filter((c) => isHrContact(c.role));
  const otherContacts = contacts.filter((c) => !isHrContact(c.role));
  const ordered = [...hrContacts, ...otherContacts];

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Ansprechpartner ({contacts.length})
          {hrContacts.length > 0 && (
            <span className="ml-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              · {hrContacts.length} HR
            </span>
          )}
        </h2>
        <button
          onClick={() => { setAdding(true); setEditingId(null); }}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5 dark:hover:text-gray-200"
          title="Ansprechpartner hinzufügen"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {adding && (
        <ContactForm
          leadId={leadId}
          onClose={() => setAdding(false)}
        />
      )}

      {contacts.length === 0 && !adding ? (
        <p className="mt-2 text-sm text-gray-400">Noch keine Kontakte.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {ordered.map((c) => {
            if (editingId === c.id) {
              return (
                <li key={c.id}>
                  <ContactForm
                    leadId={leadId}
                    contact={c}
                    onClose={() => setEditingId(null)}
                  />
                </li>
              );
            }
            return (
              <li key={c.id}>
                <ContactRow
                  contact={c}
                  leadId={leadId}
                  onEdit={() => setEditingId(c.id)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ContactRow({
  contact, leadId, onEdit,
}: { contact: LeadContact; leadId: string; onEdit: () => void }) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();
  const isHr = isHrContact(contact.role);

  function handleDelete() {
    if (!confirm(`"${contact.name}" wirklich löschen?`)) return;
    startTransition(async () => {
      const res = await deleteContact(contact.id, leadId);
      if (res.error) addToast(res.error, "error");
      else {
        addToast("Kontakt gelöscht", "success");
        router.refresh();
      }
    });
  }

  return (
    <div
      className={`group relative rounded-md border p-2 ${
        isHr
          ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-900/10"
          : "border-gray-100 dark:border-[#2c2c2e]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium">{contact.name}</p>
            {isHr && (
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                HR
              </span>
            )}
          </div>
          {contact.role && <p className="truncate text-xs text-gray-500 dark:text-gray-400">{contact.role}</p>}
          <div className="mt-0.5 space-y-0.5 text-xs">
            {contact.email && (
              <a className="block truncate text-primary hover:underline" href={`mailto:${contact.email}`}>
                {contact.email}
              </a>
            )}
            {contact.phone && (
              <a className="block truncate text-primary hover:underline" href={`tel:${contact.phone}`}>
                {contact.phone}
              </a>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            onClick={onEdit}
            className="rounded p-1 text-gray-400 opacity-70 transition hover:bg-white hover:text-gray-700 hover:opacity-100 dark:hover:bg-[#2c2c2e] dark:hover:text-gray-200"
            title="Bearbeiten"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleDelete}
            disabled={pending}
            className="rounded p-1 text-gray-400 opacity-70 transition hover:bg-red-50 hover:text-red-600 hover:opacity-100 dark:hover:bg-red-900/20"
            title="Löschen"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ContactForm({
  leadId, contact, onClose,
}: { leadId: string; contact?: LeadContact; onClose: () => void }) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [name, setName] = useState(contact?.name ?? "");
  const [role, setRole] = useState(contact?.role ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!name.trim()) return;
    startTransition(async () => {
      const res = contact
        ? await updateContact(contact.id, leadId, { name, role, email, phone })
        : await addContact({ leadId, name, role, email, phone });
      if (res.error) addToast(res.error, "error");
      else {
        addToast(contact ? "Kontakt aktualisiert" : "Kontakt angelegt", "success");
        onClose();
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-md border border-primary/40 bg-primary/5 p-2 dark:bg-primary/10">
      <div className="space-y-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name *"
          autoFocus
          className="w-full rounded-md border border-gray-200 bg-white p-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#161618]"
        />
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Rolle (z.B. HR-Manager)"
          className="w-full rounded-md border border-gray-200 bg-white p-1.5 text-xs dark:border-[#2c2c2e] dark:bg-[#161618]"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-Mail"
          type="email"
          className="w-full rounded-md border border-gray-200 bg-white p-1.5 text-xs dark:border-[#2c2c2e] dark:bg-[#161618]"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Telefon"
          className="w-full rounded-md border border-gray-200 bg-white p-1.5 text-xs dark:border-[#2c2c2e] dark:bg-[#161618]"
        />
      </div>
      <div className="mt-2 flex justify-end gap-1">
        <button
          onClick={onClose}
          className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"
        >
          <X className="h-3 w-3" />
        </button>
        <button
          onClick={submit}
          disabled={pending || !name.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
        >
          <Save className="h-3 w-3" />
          {pending ? "…" : contact ? "Aktualisieren" : "Anlegen"}
        </button>
      </div>
    </div>
  );
}

// ─── Stellen-Card ─────────────────────────────────────────────

function JobsCard({
  leadId, jobs, careerPageUrl,
}: { leadId: string; jobs: LeadJobPosting[]; careerPageUrl: string | null }) {
  const [adding, setAdding] = useState(false);

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Offene Stellen ({jobs.length})
        </h2>
        <div className="flex items-center gap-1">
          {careerPageUrl && (
            <a
              href={careerPageUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              Karriere
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
          <button
            onClick={() => setAdding(true)}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5 dark:hover:text-gray-200"
            title="Stelle hinzufügen"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {adding && <JobForm leadId={leadId} onClose={() => setAdding(false)} />}

      {jobs.length === 0 && !adding ? (
        <p className="mt-2 text-sm text-gray-400">Noch keine Stellen.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {jobs.map((j) => <li key={j.id}><JobRow job={j} leadId={leadId} /></li>)}
        </ul>
      )}
    </Card>
  );
}

function JobRow({ job, leadId }: { job: LeadJobPosting; leadId: string }) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`Stelle "${job.title}" wirklich löschen?`)) return;
    startTransition(async () => {
      const res = await deleteJobPosting(job.id, leadId);
      if (res.error) addToast(res.error, "error");
      else {
        addToast("Stelle gelöscht", "success");
        router.refresh();
      }
    });
  }

  return (
    <div className="group flex items-start justify-between gap-2 rounded-md border border-gray-100 p-2 dark:border-[#2c2c2e]">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{job.title}</p>
        {job.location && <p className="truncate text-xs text-gray-500 dark:text-gray-400">{job.location}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {job.url && (
          <a href={job.url} target="_blank" rel="noreferrer" className="rounded p-1 text-primary hover:bg-primary/10" title="Öffnen">
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
        <button
          onClick={handleDelete}
          disabled={pending}
          className="rounded p-1 text-gray-400 opacity-70 transition hover:bg-red-50 hover:text-red-600 hover:opacity-100 dark:hover:bg-red-900/20"
          title="Löschen"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function JobForm({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [url, setUrl] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!title.trim()) return;
    startTransition(async () => {
      const res = await addJobPosting({ leadId, title, location, url });
      if (res.error) addToast(res.error, "error");
      else {
        addToast("Stelle angelegt", "success");
        onClose();
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-2 rounded-md border border-primary/40 bg-primary/5 p-2 dark:bg-primary/10">
      <div className="space-y-1.5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titel (m/w/d) *"
          autoFocus
          className="w-full rounded-md border border-gray-200 bg-white p-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#161618]"
        />
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Ort"
          className="w-full rounded-md border border-gray-200 bg-white p-1.5 text-xs dark:border-[#2c2c2e] dark:bg-[#161618]"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Link zur Stellenanzeige"
          type="url"
          className="w-full rounded-md border border-gray-200 bg-white p-1.5 text-xs dark:border-[#2c2c2e] dark:bg-[#161618]"
        />
      </div>
      <div className="mt-2 flex justify-end gap-1">
        <button
          onClick={onClose}
          className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"
        >
          <X className="h-3 w-3" />
        </button>
        <button
          onClick={submit}
          disabled={pending || !title.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
        >
          <Save className="h-3 w-3" />
          {pending ? "…" : "Anlegen"}
        </button>
      </div>
    </div>
  );
}

// ─── Shared ────────────────────────────────────────────────────

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
