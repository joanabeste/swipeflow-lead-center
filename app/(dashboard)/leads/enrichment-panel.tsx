"use client";

import { useState, useTransition } from "react";
import {
  Sparkles,
  Loader2,
  User,
  Mail,
  Phone,
  ExternalLink,
  Briefcase,
  MapPin,
} from "lucide-react";
import type { LeadContact, LeadJobPosting, LeadEnrichment } from "@/lib/types";
import { enrichLeadAction } from "./enrichment-actions";

interface Props {
  leadId: string;
  hasWebsite: boolean;
  contacts: LeadContact[];
  jobPostings: LeadJobPosting[];
  latestEnrichment: LeadEnrichment | null;
}

export function EnrichmentPanel({
  leadId,
  hasWebsite,
  contacts,
  jobPostings,
  latestEnrichment,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleEnrich() {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await enrichLeadAction(leadId);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
      }
    });
  }

  const isEnriched = contacts.length > 0 || jobPostings.length > 0 || latestEnrichment?.status === "completed";

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-bold">
          <Sparkles className="h-4 w-4 text-amber-500" />
          Anreicherung
        </h3>
        <button
          onClick={handleEnrich}
          disabled={isPending || !hasWebsite}
          className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
          title={!hasWebsite ? "Keine Website/Domain vorhanden" : undefined}
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Wird angereichert…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              {isEnriched ? "Erneut anreichern" : "Anreichern"}
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-3 rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
          Anreicherung erfolgreich abgeschlossen.
        </div>
      )}

      {latestEnrichment && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {latestEnrichment.status === "completed"
            ? `Zuletzt angereichert: ${new Date(latestEnrichment.completed_at!).toLocaleString("de-DE")}`
            : latestEnrichment.status === "failed"
              ? `Fehlgeschlagen: ${latestEnrichment.error_message}`
              : latestEnrichment.status === "running"
                ? "Läuft…"
                : "Ausstehend"}
        </p>
      )}

      {/* Ansprechpartner */}
      {contacts.length > 0 && (
        <div className="mt-5">
          <h4 className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            <User className="h-3.5 w-3.5" />
            Ansprechpartner ({contacts.length})
          </h4>
          <div className="mt-2 space-y-3">
            {contacts.map((contact) => (
              <div
                key={contact.id}
                className="rounded-md border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/50"
              >
                <p className="font-medium text-sm">{contact.name}</p>
                {contact.role && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">{contact.role}</p>
                )}
                <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-400">
                  {contact.email && (
                    <a
                      href={`mailto:${contact.email}`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <Mail className="h-3 w-3" />
                      {contact.email}
                    </a>
                  )}
                  {contact.phone && (
                    <a
                      href={`tel:${contact.phone}`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <Phone className="h-3 w-3" />
                      {contact.phone}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Karriereseite */}
      {latestEnrichment?.career_page_url && (
        <div className="mt-5">
          <h4 className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            <ExternalLink className="h-3.5 w-3.5" />
            Karriereseite
          </h4>
          <a
            href={latestEnrichment.career_page_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            {latestEnrichment.career_page_url}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}

      {/* Offene Stellen */}
      {jobPostings.length > 0 && (
        <div className="mt-5">
          <h4 className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            <Briefcase className="h-3.5 w-3.5" />
            Offene Stellen ({jobPostings.length})
          </h4>
          <div className="mt-2 space-y-2">
            {jobPostings.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between rounded-md border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-800/50"
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
        </div>
      )}

      {/* Leerer State */}
      {!isEnriched && !isPending && !error && (
        <p className="mt-4 text-sm text-gray-400">
          {hasWebsite
            ? "Klicken Sie auf \"Anreichern\", um automatisch Kontaktdaten und Stellenanzeigen zu finden."
            : "Keine Website oder Domain vorhanden. Bitte zuerst ergänzen."}
        </p>
      )}
    </div>
  );
}
