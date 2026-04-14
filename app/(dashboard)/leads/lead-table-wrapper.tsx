"use client";

import { useState } from "react";
import type { Lead, EnrichmentConfig, ServiceMode } from "@/lib/types";
import { LeadTable } from "./lead-table";
import { EnrichmentConfigModal } from "./enrichment-config-modal";

interface Props {
  leads: Lead[];
  totalPages: number;
  currentPage: number;
  currentSort: string;
  currentOrder: string;
  currentQuery: string;
  currentStatus: string;
  currentFilters: Record<string, string>;
  visibleColumns: string[] | null;
  enrichmentDefaults: Record<ServiceMode, EnrichmentConfig>;
}

export function LeadTableWrapper(props: Props) {
  const [enrichModalIds, setEnrichModalIds] = useState<string[] | null>(null);
  const { enrichmentDefaults, ...tableProps } = props;

  return (
    <>
      <LeadTable
        {...tableProps}
        onOpenEnrichModal={(ids) => setEnrichModalIds(ids)}
      />
      {enrichModalIds && (
        <EnrichmentConfigModal
          leadIds={enrichModalIds}
          leads={props.leads.filter((l) => enrichModalIds.includes(l.id))}
          onClose={() => setEnrichModalIds(null)}
          defaults={enrichmentDefaults}
        />
      )}
    </>
  );
}
