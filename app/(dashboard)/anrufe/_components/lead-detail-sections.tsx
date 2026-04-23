import {
  Briefcase, Building2, ExternalLink, Globe, Hash, History, Lock, Mail, MapPin,
  PhoneIncoming, PhoneOutgoing, ShieldCheck, Sparkles, StickyNote, Users, Zap,
} from "lucide-react";
import type { ActiveLeadDetails, QueueLead } from "../actions";
import { LastCallStatusPill } from "./call-status-badges";

// ─── Kleine Bausteine ─────────────────────────────────────────

function DetailCard({
  icon: Icon,
  title,
  children,
  right,
}: {
  icon: typeof Building2;
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          <Icon className="h-3.5 w-3.5" />
          {title}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {label}
      </dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function formatAddress(lead: QueueLead): string | null {
  const line1 = lead.street ?? "";
  const line2 = [lead.zip, lead.city].filter(Boolean).join(" ");
  const line3 = [lead.state, lead.country].filter(Boolean).join(", ");
  const parts = [line1, line2, line3].filter((x) => x.trim().length > 0);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, "0")} min` : `${s}s`;
}

// ─── Haupt-Komponente ─────────────────────────────────────────

export function LeadDetailSections({
  lead,
  details,
  loading,
}: {
  lead: QueueLead;
  details: ActiveLeadDetails | null;
  loading: boolean;
}) {
  const address = formatAddress(lead);
  const hasCompanyData =
    address ||
    lead.email ||
    lead.company_size ||
    lead.legal_form ||
    lead.register_id ||
    lead.description;
  const hasTechData =
    lead.website ||
    lead.career_page_url ||
    lead.has_ssl != null ||
    lead.page_speed_score != null ||
    lead.website_tech ||
    lead.enriched_at;

  return (
    <>
      {/* Stellenanzeigen ganz oben — beim Cold-Call der primäre Gesprächsaufhänger. */}
      {details && details.jobs.length > 0 && (
        <DetailCard
          icon={Briefcase}
          title="Stellenanzeigen"
          right={
            <span className="text-[11px] text-gray-400">
              {details.jobs.length} {details.jobs.length === 1 ? "Eintrag" : "Einträge"}
            </span>
          }
        >
          <ul className="space-y-2">
            {details.jobs.map((job) => (
              <li key={job.id} className="rounded-lg border border-gray-100 p-2.5 dark:border-[#2c2c2e]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{job.title}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
                      {job.location && (
                        <span className="inline-flex items-center gap-0.5">
                          <MapPin className="h-3 w-3" />
                          {job.location}
                        </span>
                      )}
                      {job.posted_date && (
                        <span>{new Date(job.posted_date).toLocaleDateString("de-DE")}</span>
                      )}
                      {job.source && (
                        <span className="rounded bg-gray-100 px-1 text-[10px] text-gray-600 dark:bg-white/5 dark:text-gray-400">
                          {job.source}
                        </span>
                      )}
                    </div>
                  </div>
                  {job.url && (
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-gray-400 hover:text-primary"
                      title="Anzeige öffnen"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </DetailCard>
      )}

      {hasCompanyData && (
        <DetailCard icon={Building2} title="Unternehmen">
          <dl className="divide-y divide-gray-100 dark:divide-[#2c2c2e]">
            {address && (
              <DataRow label="Adresse">
                <span className="inline-flex items-start gap-1.5">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <span>{address}</span>
                </span>
              </DataRow>
            )}
            {lead.email && (
              <DataRow label="E-Mail">
                <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                  <Mail className="h-3.5 w-3.5" />
                  {lead.email}
                </a>
              </DataRow>
            )}
            {lead.company_size && (
              <DataRow label="Größe">
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5 text-gray-400" />
                  {lead.company_size}
                </span>
              </DataRow>
            )}
            {lead.legal_form && <DataRow label="Rechtsform">{lead.legal_form}</DataRow>}
            {lead.register_id && (
              <DataRow label="Register-Nr.">
                <span className="inline-flex items-center gap-1 font-mono text-xs">
                  <Hash className="h-3 w-3 text-gray-400" />
                  {lead.register_id}
                </span>
              </DataRow>
            )}
            {lead.description && (
              <DataRow label="Beschreibung">
                <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                  {lead.description}
                </p>
              </DataRow>
            )}
          </dl>
        </DetailCard>
      )}

      {hasTechData && (
        <DetailCard icon={Globe} title="Website & Tech">
          <dl className="divide-y divide-gray-100 dark:divide-[#2c2c2e]">
            {lead.website && (
              <DataRow label="Website">
                <a
                  href={lead.website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {lead.website}
                </a>
              </DataRow>
            )}
            {lead.career_page_url && (
              <DataRow label="Karriereseite">
                <a
                  href={lead.career_page_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  <Briefcase className="h-3.5 w-3.5" />
                  {lead.career_page_url}
                </a>
              </DataRow>
            )}
            {lead.has_ssl != null && (
              <DataRow label="SSL">
                {lead.has_ssl ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                    <Lock className="h-3.5 w-3.5" />
                    aktiv
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    inaktiv
                  </span>
                )}
              </DataRow>
            )}
            {lead.page_speed_score != null && (
              <DataRow label="Page Speed">
                <span className="inline-flex items-center gap-1">
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                  {lead.page_speed_score} / 100
                </span>
              </DataRow>
            )}
            {lead.website_tech && (
              <DataRow label="Tech">
                <span className="text-sm text-gray-700 dark:text-gray-300">{lead.website_tech}</span>
              </DataRow>
            )}
            {lead.enriched_at && (
              <DataRow label="Angereichert">
                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                  <Sparkles className="h-3 w-3 text-purple-500" />
                  {new Date(lead.enriched_at).toLocaleString("de-DE")}
                  {lead.enrichment_source && (
                    <span className="text-gray-400"> · {lead.enrichment_source}</span>
                  )}
                </span>
              </DataRow>
            )}
          </dl>
        </DetailCard>
      )}

      {details && details.notes.length > 0 && (
        <DetailCard
          icon={StickyNote}
          title="Letzte Notizen"
          right={
            <span className="text-[11px] text-gray-400">
              {details.notes.length} von max. 3
            </span>
          }
        >
          <ul className="space-y-2">
            {details.notes.map((note) => (
              <li
                key={note.id}
                className="rounded-lg border border-gray-100 bg-gray-50/40 p-3 dark:border-[#2c2c2e] dark:bg-white/[0.02]"
              >
                <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500">
                  <span>{note.author_name || "—"}</span>
                  <span>{new Date(note.created_at).toLocaleString("de-DE")}</span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                  {note.content}
                </p>
              </li>
            ))}
          </ul>
        </DetailCard>
      )}

      {details && details.calls.length > 0 && (
        <DetailCard
          icon={History}
          title="Anrufhistorie"
          right={<span className="text-[11px] text-gray-400">letzte {details.calls.length}</span>}
        >
          <ul className="space-y-2">
            {details.calls.map((call) => {
              const Icon = call.direction === "inbound" ? PhoneIncoming : PhoneOutgoing;
              return (
                <li key={call.id} className="rounded-lg border border-gray-100 p-2.5 dark:border-[#2c2c2e]">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                    <Icon className="h-3.5 w-3.5 text-gray-400" />
                    <span>{new Date(call.started_at).toLocaleString("de-DE")}</span>
                    {call.status && <LastCallStatusPill status={call.status} />}
                    <span className="text-gray-400">{formatDuration(call.duration_seconds)}</span>
                    {call.phone_number && (
                      <span className="font-mono text-gray-400">{call.phone_number}</span>
                    )}
                  </div>
                  {call.notes && (
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                      {call.notes}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </DetailCard>
      )}

      {loading && !details && (
        <div className="space-y-4">
          <div className="h-28 animate-pulse rounded-2xl border border-gray-200 bg-gray-50 dark:border-[#2c2c2e]/50 dark:bg-white/[0.02]" />
          <div className="h-28 animate-pulse rounded-2xl border border-gray-200 bg-gray-50 dark:border-[#2c2c2e]/50 dark:bg-white/[0.02]" />
        </div>
      )}

      {!loading && details && !hasCompanyData && !hasTechData &&
        details.jobs.length === 0 && details.notes.length === 0 && details.calls.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center text-xs text-gray-400 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
            Keine weiteren Details für diesen Lead verfügbar.
          </div>
        )}
    </>
  );
}
