"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Maximize2 } from "lucide-react";
import { Drawer } from "@/components/drawer";
import { LeadProfilePanel } from "../lead-profile-panel";
import { LeadScreenshotCardClient } from "./lead-screenshot-card-client";
import type { LeadDetailBundle } from "@/lib/leads/load-lead-detail";
import { normalizeWebsiteUrl } from "@/lib/website-url";
import { PreviewRefreshProvider } from "@/lib/preview-refresh-context";

interface Props {
  /** lead-id im ?preview=… Query-Param; null = zu */
  previewId: string | null;
  onClose: () => void;
}

/**
 * Vorschau-Sidebar fuer einen Lead auf /leads.
 * Laedt das Daten-Bundle on-open via /api/leads/[id]/preview und rendert
 * das vorhandene LeadProfilePanel im Drawer.
 */
export function LeadPreviewDrawer({ previewId, onClose }: Props) {
  const [data, setData] = useState<LeadDetailBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch on previewId-change; setState im Effect ist hier bewusst (externer
  // Datenladevorgang). Disables analog zum projektweiten Pattern.
  useEffect(() => {
    if (!previewId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(null);
       
      setError(null);
      return;
    }
    let cancelled = false;
     
    setLoading(true);
     
    setError(null);
    fetch(`/api/leads/${previewId}/preview`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Status ${r.status}`);
        return r.json() as Promise<LeadDetailBundle>;
      })
      .then((bundle) => {
        if (cancelled) return;
        setData(bundle);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Unbekannter Fehler");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [previewId]);

  const open = previewId !== null;
  const title = data?.lead.company_name ?? (loading ? "Lade…" : "Vorschau");

  return (
    <Drawer
      open={open}
      onClose={onClose}
      storageKey="preview-drawer-width"
      defaultWidth={880}
      title={<span className="truncate">{title}</span>}
      headerExtras={
        previewId ? (
          <Link
            href={`/leads/${previewId}`}
            title="In Vollansicht öffnen"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
          >
            <Maximize2 className="h-4 w-4" />
          </Link>
        ) : null
      }
    >
      <div className="p-4">
        {loading && !data && <PreviewSkeleton />}
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            Fehler beim Laden: {error}
          </div>
        )}
        {data && (
          <LeadProfilePanel
            lead={data.lead}
            changes={data.changes}
            contacts={data.contacts}
            jobPostings={data.jobPostings}
            latestEnrichment={data.latestEnrichment}
            customStatuses={data.customStatuses}
            hq={data.hq}
            onBack={onClose}
            backLabel="Schließen"
            extraRightColumn={
              <LeadScreenshotCardClient
                signedUrl={data.screenshotSignedUrl}
                takenAt={data.lead.website_screenshot_taken_at}
                websiteUrl={normalizeWebsiteUrl(data.lead.website)}
              />
            }
          />
        )}
      </div>
    </Drawer>
  );
}

function PreviewSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-[#2c2c2e]" />
      <div className="h-32 animate-pulse rounded bg-gray-100 dark:bg-[#1c1c1e]" />
      <div className="h-32 animate-pulse rounded bg-gray-100 dark:bg-[#1c1c1e]" />
      <div className="h-48 animate-pulse rounded bg-gray-100 dark:bg-[#1c1c1e]" />
    </div>
  );
}
