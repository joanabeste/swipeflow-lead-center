"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Globe, Phone, Mail, MapPin, Briefcase, User, Trash2, Plus, Sparkles,
  StickyNote, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock,
} from "lucide-react";
import type {
  CustomLeadStatus, Lead, LeadContact, LeadJobPosting, LeadNote, LeadCall, LeadEnrichment,
  CallDirection, CallStatus,
} from "@/lib/types";
import { CrmStatusBadge } from "../status-badge";
import { updateCrmStatus, addNote, deleteNote, logCall, startCall } from "../actions";
import { enrichLeadAction } from "../../leads/enrichment-actions";

type NoteWithAuthor = LeadNote & { profiles: { name: string; email: string } | null };
type CallWithAuthor = LeadCall & { profiles: { name: string; email: string } | null };

export function CrmLeadPanel({
  lead,
  statuses,
  contacts,
  jobs,
  notes,
  calls,
  latestEnrichment,
}: {
  lead: Lead;
  statuses: CustomLeadStatus[];
  contacts: LeadContact[];
  jobs: LeadJobPosting[];
  notes: NoteWithAuthor[];
  calls: CallWithAuthor[];
  latestEnrichment: LeadEnrichment | null;
}) {
  const [tab, setTab] = useState<"uebersicht" | "notizen" | "anrufe">("uebersicht");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enriching, startEnrich] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const activeStatuses = statuses.filter((s) => s.is_active);

  function handleStatusChange(statusId: string) {
    startTransition(async () => {
      const res = await updateCrmStatus(lead.id, statusId || null);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function handleEnrich() {
    setError(null);
    startEnrich(async () => {
      const res = await enrichLeadAction(lead.id);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="mt-4 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{lead.company_name}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {[lead.city, lead.industry, lead.company_size].filter(Boolean).join(" · ") || "–"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <select
              value={lead.crm_status_id ?? ""}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={pending}
              className="rounded-md border border-gray-200 bg-transparent px-2 py-1 text-sm dark:border-[#2c2c2e]"
            >
              <option value="">— CRM-Status —</option>
              {activeStatuses.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            <CrmStatusBadge statusId={lead.crm_status_id} statuses={statuses} />
          </div>
          <button
            onClick={handleEnrich}
            disabled={enriching}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-[#2c2c2e] dark:hover:bg-white/5"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {enriching ? "Reichert an…" : "Erneut anreichern"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-[#2c2c2e]">
        <nav className="flex gap-6">
          <TabButton active={tab === "uebersicht"} onClick={() => setTab("uebersicht")}>
            Übersicht
          </TabButton>
          <TabButton active={tab === "notizen"} onClick={() => setTab("notizen")}>
            Notizen ({notes.length})
          </TabButton>
          <TabButton active={tab === "anrufe"} onClick={() => setTab("anrufe")}>
            Anrufe ({calls.length})
          </TabButton>
        </nav>
      </div>

      {tab === "uebersicht" && (
        <OverviewTab
          lead={lead}
          contacts={contacts}
          jobs={jobs}
          latestEnrichment={latestEnrichment}
        />
      )}
      {tab === "notizen" && <NotesTab leadId={lead.id} notes={notes} />}
      {tab === "anrufe" && <CallsTab leadId={lead.id} contacts={contacts} calls={calls} defaultPhone={lead.phone} />}
    </div>
  );
}

function TabButton({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`border-b-2 px-1 pb-3 text-sm font-medium transition ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Übersicht ─────────────────────────────────────────────────────────

function OverviewTab({
  lead, contacts, jobs, latestEnrichment,
}: {
  lead: Lead;
  contacts: LeadContact[];
  jobs: LeadJobPosting[];
  latestEnrichment: LeadEnrichment | null;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Stammdaten */}
      <Card title="Stammdaten">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Field icon={Globe} label="Website" value={lead.website ?? lead.domain} link />
          <Field icon={Phone} label="Telefon" value={lead.phone} href={lead.phone ? `tel:${lead.phone}` : null} />
          <Field icon={Mail} label="E-Mail" value={lead.email} href={lead.email ? `mailto:${lead.email}` : null} />
          <Field icon={MapPin} label="Adresse" value={[lead.street, lead.zip && lead.city ? `${lead.zip} ${lead.city}` : lead.city].filter(Boolean).join(", ") || null} />
          <Field icon={Briefcase} label="Branche" value={lead.industry} />
          <Field icon={User} label="Größe" value={lead.company_size} />
        </dl>
        {latestEnrichment?.completed_at && (
          <p className="mt-4 text-xs text-gray-400">
            Zuletzt angereichert: {new Date(latestEnrichment.completed_at).toLocaleString("de-DE")}
          </p>
        )}
      </Card>

      {/* Kontakte */}
      <Card title={`Ansprechpartner (${contacts.length})`}>
        {contacts.length === 0 ? (
          <p className="text-sm text-gray-400">Keine Kontakte hinterlegt.</p>
        ) : (
          <ul className="space-y-2">
            {contacts.map((c) => (
              <li key={c.id} className="rounded-md border border-gray-100 p-3 dark:border-[#2c2c2e]">
                <p className="text-sm font-medium">{c.name}</p>
                {c.role && <p className="text-xs text-gray-500 dark:text-gray-400">{c.role}</p>}
                <div className="mt-1 flex flex-wrap gap-3 text-xs">
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                      <Mail className="h-3 w-3" />{c.email}
                    </a>
                  )}
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                      <Phone className="h-3 w-3" />{c.phone}
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Stellen */}
      <Card title={`Offene Stellen (${jobs.length})`} className="lg:col-span-2">
        {jobs.length === 0 ? (
          <p className="text-sm text-gray-400">Keine Stellen hinterlegt.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-[#2c2c2e]">
            {jobs.map((j) => (
              <li key={j.id} className="py-2">
                <p className="text-sm font-medium">{j.title}</p>
                <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
                  {j.location && <span>{j.location}</span>}
                  {j.posted_date && <span>· {j.posted_date}</span>}
                  {j.url && (
                    <a href={j.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      Öffnen
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e] ${className}`}>
      <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Field({
  icon: Icon, label, value, href, link,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
  href?: string | null;
  link?: boolean;
}) {
  return (
    <>
      <dt className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
        <Icon className="h-3 w-3" /> {label}
      </dt>
      <dd className="truncate text-sm">
        {value ? (
          href ? (
            <a href={href} className="text-primary hover:underline">{value}</a>
          ) : link && value ? (
            <a href={value.startsWith("http") ? value : `https://${value}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
              {value}
            </a>
          ) : value
        ) : (
          <span className="text-gray-400">–</span>
        )}
      </dd>
    </>
  );
}

// ─── Notizen ──────────────────────────────────────────────────────────

function NotesTab({ leadId, notes }: { leadId: string; notes: NoteWithAuthor[] }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!content.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await addNote(leadId, content);
      if (res.error) setError(res.error);
      else {
        setContent("");
        router.refresh();
      }
    });
  }

  function handleDelete(noteId: string) {
    if (!confirm("Notiz wirklich löschen?")) return;
    startTransition(async () => {
      await deleteNote(noteId, leadId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card title="Neue Notiz">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Gespräch, Follow-Up, Beobachtung …"
          rows={3}
          className="w-full resize-none rounded-lg border border-gray-200 bg-white p-3 text-sm dark:border-[#2c2c2e] dark:bg-[#161618]"
        />
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <div className="mt-2 flex justify-end">
          <button
            onClick={submit}
            disabled={pending || !content.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {pending ? "Speichern…" : "Notiz speichern"}
          </button>
        </div>
      </Card>

      {notes.length === 0 ? (
        <p className="text-sm text-gray-400">Noch keine Notizen.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li
              key={n.id}
              className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <StickyNote className="h-3.5 w-3.5" />
                  <span className="font-medium">{n.profiles?.name ?? "Unbekannt"}</span>
                  <span>· {new Date(n.created_at).toLocaleString("de-DE")}</span>
                </div>
                <button
                  onClick={() => handleDelete(n.id)}
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{n.content}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Anrufe ──────────────────────────────────────────────────────────

function CallIcon({ call }: { call: LeadCall }) {
  if (call.status === "missed") return <PhoneMissed className="h-4 w-4 text-red-500" />;
  if (call.direction === "inbound") return <PhoneIncoming className="h-4 w-4 text-blue-500" />;
  return <PhoneOutgoing className="h-4 w-4 text-emerald-500" />;
}

function CallsTab({
  leadId, contacts, calls, defaultPhone,
}: {
  leadId: string;
  contacts: LeadContact[];
  calls: CallWithAuthor[];
  defaultPhone: string | null;
}) {
  const router = useRouter();
  const [direction, setDirection] = useState<CallDirection>("outbound");
  const [status, setStatus] = useState<CallStatus>("answered");
  const [duration, setDuration] = useState<number>(0);
  const [phoneNumber, setPhoneNumber] = useState<string>(defaultPhone ?? "");
  const [contactId, setContactId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await logCall({
        leadId,
        contactId: contactId || null,
        direction,
        status,
        durationSeconds: duration > 0 ? duration : null,
        notes: notes.trim() || null,
        phoneNumber: phoneNumber || null,
      });
      if (res.error) setError(res.error);
      else {
        setNotes("");
        setDuration(0);
        router.refresh();
      }
    });
  }

  const [callStarting, startCallTransition] = useTransition();
  const [callError, setCallError] = useState<string | null>(null);
  function handleStartCall(targetPhone: string, targetContactId: string | null) {
    if (!targetPhone) {
      setCallError("Keine Telefonnummer vorhanden.");
      return;
    }
    setCallError(null);
    startCallTransition(async () => {
      const res = await startCall({
        leadId,
        contactId: targetContactId,
        phoneNumber: targetPhone,
      });
      if (res.error) setCallError(res.error);
      else router.refresh();
    });
  }

  const callableContacts = contacts.filter((c) => c.phone);

  return (
    <div className="space-y-4">
      <Card title="Anrufen">
        {(defaultPhone || callableContacts.length > 0) ? (
          <ul className="space-y-2">
            {defaultPhone && (
              <li className="flex items-center justify-between rounded-md border border-gray-100 p-3 dark:border-[#2c2c2e]">
                <div>
                  <p className="text-sm font-medium">Firmennummer</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{defaultPhone}</p>
                </div>
                <button
                  onClick={() => handleStartCall(defaultPhone, null)}
                  disabled={callStarting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <PhoneOutgoing className="h-4 w-4" />
                  {callStarting ? "Starte…" : "Anrufen"}
                </button>
              </li>
            )}
            {callableContacts.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-md border border-gray-100 p-3 dark:border-[#2c2c2e]"
              >
                <div>
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {c.role ? `${c.role} · ` : ""}
                    {c.phone}
                  </p>
                </div>
                <button
                  onClick={() => handleStartCall(c.phone!, c.id)}
                  disabled={callStarting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <PhoneOutgoing className="h-4 w-4" />
                  Anrufen
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400">Keine Telefonnummer hinterlegt.</p>
        )}
        {callError && <p className="mt-2 text-xs text-red-600">{callError}</p>}
      </Card>

      <Card title="Manueller Call-Log">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            <span className="text-xs text-gray-500 dark:text-gray-400">Richtung</span>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as CallDirection)}
              className="mt-1 w-full rounded-md border border-gray-200 bg-white p-2 dark:border-[#2c2c2e] dark:bg-[#161618]"
            >
              <option value="outbound">Ausgehend</option>
              <option value="inbound">Eingehend</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="text-xs text-gray-500 dark:text-gray-400">Ergebnis</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as CallStatus)}
              className="mt-1 w-full rounded-md border border-gray-200 bg-white p-2 dark:border-[#2c2c2e] dark:bg-[#161618]"
            >
              <option value="answered">Angenommen</option>
              <option value="ended">Beendet</option>
              <option value="missed">Nicht erreicht</option>
              <option value="failed">Fehlgeschlagen</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="text-xs text-gray-500 dark:text-gray-400">Dauer (Sekunden)</span>
            <input
              type="number"
              min={0}
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value, 10) || 0)}
              className="mt-1 w-full rounded-md border border-gray-200 bg-white p-2 dark:border-[#2c2c2e] dark:bg-[#161618]"
            />
          </label>
          <label className="text-sm">
            <span className="text-xs text-gray-500 dark:text-gray-400">Telefonnummer</span>
            <input
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-200 bg-white p-2 dark:border-[#2c2c2e] dark:bg-[#161618]"
            />
          </label>
          <label className="text-sm md:col-span-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Kontakt (optional)</span>
            <select
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-200 bg-white p-2 dark:border-[#2c2c2e] dark:bg-[#161618]"
            >
              <option value="">—</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.role ? ` (${c.role})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm md:col-span-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Gesprächsnotiz</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full resize-none rounded-md border border-gray-200 bg-white p-2 dark:border-[#2c2c2e] dark:bg-[#161618]"
            />
          </label>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <div className="mt-3 flex justify-end">
          <button
            onClick={submit}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {pending ? "Speichern…" : "Anruf speichern"}
          </button>
        </div>
      </Card>

      {calls.length === 0 ? (
        <p className="text-sm text-gray-400">Noch keine Anrufe.</p>
      ) : (
        <ul className="space-y-3">
          {calls.map((call) => (
            <li
              key={call.id}
              className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]"
            >
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <CallIcon call={call} />
                <span className="font-medium">
                  {call.direction === "inbound" ? "Eingehend" : "Ausgehend"}
                </span>
                <span className="text-gray-500 dark:text-gray-400">· {statusLabel(call.status)}</span>
                {call.duration_seconds != null && (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <Clock className="h-3 w-3" /> {formatDuration(call.duration_seconds)}
                  </span>
                )}
                <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                  {new Date(call.started_at).toLocaleString("de-DE")}
                </span>
              </div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {call.profiles?.name ?? "System"}
                {call.phone_number && ` · ${call.phone_number}`}
              </div>
              {call.notes && <p className="mt-2 whitespace-pre-wrap text-sm">{call.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function statusLabel(s: CallStatus): string {
  const map: Record<CallStatus, string> = {
    initiated: "Initiiert",
    ringing: "Klingelt",
    answered: "Angenommen",
    missed: "Nicht erreicht",
    failed: "Fehlgeschlagen",
    ended: "Beendet",
  };
  return map[s];
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")} min`;
}
