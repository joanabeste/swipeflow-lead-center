"use client";

import { useState } from "react";
import type { Lead } from "@/lib/types";
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
}

export function LeadTableWrapper(props: Props) {
  const [enrichModalIds, setEnrichModalIds] = useState<string[] | null>(null);

  return (
    <>
      <LeadTable
        {...props}
        onOpenEnrichModal={(ids) => setEnrichModalIds(ids)}
      />
      {enrichModalIds && (
        <EnrichmentConfigModal
          leadIds={enrichModalIds}
          leads={props.leads.filter((l) => enrichModalIds.includes(l.id))}
          onClose={() => setEnrichModalIds(null)}
        />
      )}
    </>
  );
}
