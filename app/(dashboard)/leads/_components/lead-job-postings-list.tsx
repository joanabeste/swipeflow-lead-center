import { Briefcase, ExternalLink, MapPin } from "lucide-react";
import type { LeadJobPosting, LeadEnrichment } from "@/lib/types";

export function LeadJobPostingsList({
  jobPostings, latestEnrichment, hasWebsite,
}: {
  jobPostings: LeadJobPosting[];
  latestEnrichment: LeadEnrichment | null;
  hasWebsite: boolean;
}) {
  return (
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
  );
}
