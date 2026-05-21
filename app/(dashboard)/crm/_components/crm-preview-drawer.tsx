"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Maximize2 } from "lucide-react";
import { Drawer } from "@/components/drawer";
import { CrmLeadDetail } from "../[id]/crm-lead-detail";
import { LeadScreenshotCardClient } from "../../leads/_components/lead-screenshot-card-client";
import type { CrmDetailBundle } from "@/lib/crm/load-crm-detail";

interface Props {
  previewId: string | null;
  onClose: () => void;
}

export function CrmPreviewDrawer({ previewId, onClose }: Props) {
  const [data, setData] = useState<CrmDetailBundle | null>(null);
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
    fetch(`/api/crm/${previewId}/preview`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Status ${r.status}`);
        return r.json() as Promise<CrmDetailBundle>;
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
            href={`/crm/${previewId}`}
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
          <CrmLeadDetail
            lead={data.lead}
            contacts={data.contacts}
            jobs={data.jobs}
            notes={data.notes}
            calls={data.calls}
            emails={data.emails}
            enrichments={data.enrichments}
            changes={data.changes}
            auditLogs={data.auditLogs}
            statuses={data.statuses}
            hq={data.hq}
            callProviders={data.callProviders}
            senderName={data.senderName}
            deals={data.deals}
            dealStages={data.dealStages}
            team={data.team}
            industries={data.industries}
            caseStudies={data.caseStudies}
            landingPages={data.landingPages}
            todos={data.todos}
            onBack={onClose}
            screenshotCard={
              <LeadScreenshotCardClient
                signedUrl={data.screenshotSignedUrl}
                takenAt={data.lead.website_screenshot_taken_at}
                websiteUrl={data.lead.website ? `https://${data.lead.website}` : null}
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
      <div className="grid gap-4 md:grid-cols-[380px_1fr]">
        <div className="space-y-3">
          <div className="h-40 animate-pulse rounded bg-gray-100 dark:bg-[#1c1c1e]" />
          <div className="h-32 animate-pulse rounded bg-gray-100 dark:bg-[#1c1c1e]" />
          <div className="h-32 animate-pulse rounded bg-gray-100 dark:bg-[#1c1c1e]" />
        </div>
        <div className="h-96 animate-pulse rounded bg-gray-100 dark:bg-[#1c1c1e]" />
      </div>
    </div>
  );
}
