import { Briefcase, Mail, Phone, MapPin, User, ExternalLink } from "lucide-react";
import type { Lead, LeadEnrichment } from "@/lib/types";
import { Card, Row } from "./crm-shared";

export function CrmCompanyCard({
  lead, latestEnrichment,
}: { lead: Lead; latestEnrichment: LeadEnrichment | null }) {
  return (
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
  );
}
