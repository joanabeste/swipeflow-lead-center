"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { Drawer } from "@/components/drawer";
import { CrmLeadDetail } from "../[id]/crm-lead-detail";
import { LeadScreenshotCardClient } from "../../leads/_components/lead-screenshot-card-client";
import type { CrmDetailBundle } from "@/lib/crm/load-crm-detail";
import { normalizeWebsiteUrl } from "@/lib/website-url";
import { PreviewRefreshProvider } from "@/lib/preview-refresh-context";
import { prefetchNeighbors } from "@/lib/preview/prefetch";

interface Props {
  previewId: string | null;
  /** Aktuelle CRM-Lead-Liste in Sortier-Reihenfolge fuer Prev/Next + Prefetch. */
  siblingIds?: string[];
  /** Basis-Pfad fuer URL-Updates (default /crm). */
  basePath?: string;
  onClose: () => void;
}

const SLIDE_OUT_MS = 200;

export function CrmPreviewDrawer({ previewId, siblingIds = [], basePath = "/crm", onClose }: Props) {
  const router = useRouter();
  const [data, setData] = useState<CrmDetailBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const loadBundle = useCallback(
    (id: string, opts?: { silent?: boolean }) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      if (!opts?.silent) setLoading(true);
      setError(null);
      fetch(`/api/crm/${id}/preview`, { signal: ac.signal })
        .then(async (r) => {
          if (!r.ok) throw new Error(`Status ${r.status}`);
          return r.json() as Promise<CrmDetailBundle>;
        })
        .then((bundle) => {
          if (ac.signal.aborted) return;
          setData(bundle);
        })
        .catch((e: unknown) => {
          if (ac.signal.aborted) return;
          setError(e instanceof Error ? e.message : "Unbekannter Fehler");
        })
        .finally(() => {
          if (!ac.signal.aborted && !opts?.silent) setLoading(false);
        });
    },
    [],
  );

  // Fetch on previewId-change; setState im Effect ist hier bewusst (externer
  // Datenladevorgang). Disables analog zum projektweiten Pattern.
  useEffect(() => {
    if (!previewId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(null);
      setError(null);
      // closing erst hier zuruecksetzen — sonst flackert der Drawer kurz wieder
      // auf, weil das setTimeout vor dem URL-Update feuert.
      setClosing(false);
      return;
    }
    setClosing(false);
    loadBundle(previewId);
    return () => {
      abortRef.current?.abort();
    };
  }, [previewId, loadBundle]);

  // Nachbarn idle prefetchen, damit Prev/Next instant sind.
  useEffect(() => {
    if (!previewId || siblingIds.length === 0) return;
    prefetchNeighbors(siblingIds, previewId, "crm", 2);
  }, [previewId, siblingIds]);

  const handleRefresh = useCallback(() => {
    if (previewId) loadBundle(previewId, { silent: true });
    router.refresh();
  }, [previewId, loadBundle, router]);

  // closing bleibt true bis previewId durch onClose null wird (useEffect oben
  // resetet) — sonst flackert der Drawer 1 Frame lang auf.
  const handleClose = useCallback(() => {
    if (closing) return;
    abortRef.current?.abort();
    setClosing(true);
    setTimeout(() => {
      onClose();
    }, SLIDE_OUT_MS);
  }, [closing, onClose]);

  const idx = previewId ? siblingIds.indexOf(previewId) : -1;
  const prevId = idx > 0 ? siblingIds[idx - 1] : null;
  const nextId = idx >= 0 && idx < siblingIds.length - 1 ? siblingIds[idx + 1] : null;

  const goTo = useCallback(
    (id: string) => {
      router.push(`${basePath}?preview=${id}`, { scroll: false });
    },
    [router, basePath],
  );

  useEffect(() => {
    if (!previewId || closing) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft" && prevId) {
        e.preventDefault();
        goTo(prevId);
      } else if (e.key === "ArrowRight" && nextId) {
        e.preventDefault();
        goTo(nextId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewId, prevId, nextId, goTo, closing]);

  const open = previewId !== null && !closing;
  const title = data?.lead.company_name ?? (loading ? "Lade…" : "Vorschau");
  const counter = idx >= 0 && siblingIds.length > 0 ? `${idx + 1}/${siblingIds.length}` : null;

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      storageKey="preview-drawer-width"
      defaultWidth={880}
      title={<span className="truncate">{title}</span>}
      headerExtras={
        <>
          {siblingIds.length > 1 && (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => prevId && goTo(prevId)}
                disabled={!prevId}
                aria-label="Vorheriger Lead"
                title="Vorheriger Lead (←)"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {counter && (
                <span className="px-1 text-xs tabular-nums text-gray-500 dark:text-gray-400">{counter}</span>
              )}
              <button
                type="button"
                onClick={() => nextId && goTo(nextId)}
                disabled={!nextId}
                aria-label="Naechster Lead"
                title="Naechster Lead (→)"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
          {previewId && (
            <Link
              href={`/crm/${previewId}`}
              title="In Vollansicht öffnen"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
            >
              <Maximize2 className="h-4 w-4" />
            </Link>
          )}
        </>
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
          <PreviewRefreshProvider onRefresh={handleRefresh}>
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
            onBack={handleClose}
            forceStackedLayout={true}
            screenshotCard={
              <LeadScreenshotCardClient
                signedUrl={data.screenshotSignedUrl}
                takenAt={data.lead.website_screenshot_taken_at}
                websiteUrl={normalizeWebsiteUrl(data.lead.website)}
              />
            }
          />
          </PreviewRefreshProvider>
        )}
      </div>
    </Drawer>
  );
}

function PreviewSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-[#2c2c2e]" />
      <div className="h-40 animate-pulse rounded bg-gray-100 dark:bg-[#1c1c1e]" />
      <div className="h-32 animate-pulse rounded bg-gray-100 dark:bg-[#1c1c1e]" />
      <div className="h-32 animate-pulse rounded bg-gray-100 dark:bg-[#1c1c1e]" />
      <div className="h-64 animate-pulse rounded bg-gray-100 dark:bg-[#1c1c1e]" />
    </div>
  );
}
