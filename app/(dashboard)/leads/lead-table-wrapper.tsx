"use client";

import { useState } from "react";
import type { Lead, EnrichmentConfig, ServiceMode, CustomLeadStatus } from "@/lib/types";
import type { ColumnPref } from "@/lib/table-prefs";
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
  initialColumnPrefs: ColumnPref[];
  enrichmentDefaults: Record<ServiceMode, EnrichmentConfig>;
  customStatuses: CustomLeadStatus[];
}

export function LeadTableWrapper(props: Props) {
  const [enrichModalIds, setEnrichModalIds] = useState<string[] | null>(null);
  const { enrichmentDefaults, customStatuses, ...tableProps } = props;

  return (
    <>
      <LeadTable
        {...tableProps}
        onOpenEnrichModal={(ids) => setEnrichModalIds(ids)}
      />
      {enrichModalIds && (
        <EnrichmentConfigModal
          leadIds={enrichModalIds}
          onClose={() => setEnrichModalIds(null)}
          defaults={enrichmentDefaults}
          customStatuses={customStatuses}
        />
      )}
    </>
  );
}
