"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { Drawer } from "@/components/drawer";
import { LeadProfilePanel } from "../lead-profile-panel";
import { LeadScreenshotCardClient } from "./lead-screenshot-card-client";
import { LeadTrafficLightCard } from "./lead-traffic-light-card";
import type { LeadDetailBundle } from "@/lib/leads/load-lead-detail";
import { normalizeWebsiteUrl } from "@/lib/website-url";
import { PreviewRefreshProvider } from "@/lib/preview-refresh-context";
import { prefetchNeighbors } from "@/lib/preview/prefetch";

interface Props {
  /** lead-id im ?preview=… Query-Param; null = zu */
  previewId: string | null;
  /** Aktuell sichtbare Lead-Liste in Sortier-Reihenfolge. Wird fuer
   *  Prev/Next-Navigation und Idle-Prefetch der Nachbarn genutzt. */
  siblingIds?: string[];
  /** Basis-URL fuer Navigation (Pagination/Filter ohne `preview` Param).
   *  Default: /leads */
  basePath?: string;
  onClose: () => void;
}

const SLIDE_OUT_MS = 200;

/**
 * Vorschau-Sidebar fuer einen Lead auf /leads.
 * Laedt das Daten-Bundle on-open via /api/leads/[id]/preview und rendert
 * das vorhandene LeadProfilePanel im Drawer.
 *
 * Schnelles Wechseln: Hover-Prefetch in der Tabelle + 30s Browser-Cache auf
 *   der API-Route + Idle-Prefetch der ±2 Nachbarn beim Oeffnen.
 * Snappy Close: lokaler `closing`-State steuert die CSS-Slide-Animation
 *   sofort; die URL-Aktualisierung folgt erst nach Animationsende.
 */
export function LeadPreviewDrawer({ previewId, siblingIds = [], basePath = "/leads", onClose }: Props) {
  const router = useRouter();
  const [data, setData] = useState<LeadDetailBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const loadBundle = useCallback(
    (id: string, opts?: { silent?: boolean; fresh?: boolean }) => {
      // Vorherigen Fetch abbrechen — bei schnellem Lead-zu-Lead-Klick haengt
      // der alte Request sonst weiter und verschwendet Server-Zeit.
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      if (!opts?.silent) setLoading(true);
      setError(null);
      // fresh=true (nach einer Mutation): Browser-Cache umgehen UND die
      // gecachte Antwort ersetzen (cache:"reload"), damit auch ein spaeteres
      // Zurueckblättern die frischen Daten zeigt — die Route cached sonst 30s.
      fetch(`/api/leads/${id}/preview`, {
        signal: ac.signal,
        cache: opts?.fresh ? "reload" : "default",
      })
        .then(async (r) => {
          if (!r.ok) throw new Error(`Status ${r.status}`);
          return r.json() as Promise<LeadDetailBundle>;
        })
        .then((bundle) => {
          if (ac.signal.aborted) return;
          setData(bundle);
          // Geocoding asynchron nachholen, falls Koordinaten fehlen und eine
          // Adresse vorhanden ist. Blockiert nicht den initialen Render.
          const lead = bundle.lead;
          const hasAddr = Boolean(lead.street || lead.zip || lead.city);
          if (hasAddr && (lead.latitude == null || lead.longitude == null)) {
            fetch(`/api/leads/${id}/geocode`, { method: "POST", cache: "no-store", signal: ac.signal })
              .then((r) => (r.ok ? r.json() : null))
              .then((j: { lat: number | null; lng: number | null } | null) => {
                if (ac.signal.aborted || !j || j.lat == null || j.lng == null) return;
                setData((prev) =>
                  prev && prev.lead.id === id
                    ? { ...prev, lead: { ...prev.lead, latitude: j.lat, longitude: j.lng } }
                    : prev,
                );
              })
              .catch((err) => {
                if (!ac.signal.aborted) console.warn("[lead-preview] geocode-fallback failed:", err);
              });
          }
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
      // closing wird erst hier zurueckgesetzt — sonst flackert der Drawer in
      // dem Frame zwischen setTimeout-Ende und URL-Update kurz wieder auf.
      setClosing(false);
      return;
    }
    // Sobald ein neuer Lead reinkommt, ist ein gerade laufender Close abgebrochen.
    setClosing(false);
    loadBundle(previewId);
    return () => {
      abortRef.current?.abort();
    };
  }, [previewId, loadBundle]);

  // Wenn der Drawer offen ist, Nachbarn idle prefetchen — Prev/Next fuehlen
  // sich dann instant an.
  useEffect(() => {
    if (!previewId || siblingIds.length === 0) return;
    prefetchNeighbors(siblingIds, previewId, "leads", 2);
  }, [previewId, siblingIds]);

  const handleRefresh = useCallback(() => {
    if (previewId) loadBundle(previewId, { silent: true, fresh: true });
    router.refresh();
  }, [previewId, loadBundle, router]);

  // Snappy Close: Slide-Animation startet sofort durch local-state Flip.
  // Erst nach Animationsende rufen wir onClose() — das aktualisiert die URL.
  // closing bleibt true bis der useEffect oben (previewId === null) es resetet,
  // damit der Drawer in der Zwischenzeit nicht kurz aufflackert.
  const handleClose = useCallback(() => {
    if (closing) return;
    abortRef.current?.abort();
    setClosing(true);
    setTimeout(() => {
      onClose();
    }, SLIDE_OUT_MS);
  }, [closing, onClose]);

  // Prev/Next-Navigation
  const idx = previewId ? siblingIds.indexOf(previewId) : -1;
  const prevId = idx > 0 ? siblingIds[idx - 1] : null;
  const nextId = idx >= 0 && idx < siblingIds.length - 1 ? siblingIds[idx + 1] : null;

  const goTo = useCallback(
    (id: string) => {
      router.push(`${basePath}?preview=${id}`, { scroll: false });
    },
    [router, basePath],
  );

  // Keyboard-Shortcuts ←/→ wenn der Drawer offen ist und der Fokus nicht in
  // einem Input liegt.
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
              href={`/leads/${previewId}`}
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
            {/* key=lead.id: beim Blättern (prev/next) wird das Panel neu
                gemountet, damit unkontrollierte Stammdaten-Inputs und der
                Status-useState frisch aus dem neuen Lead initialisiert werden.
                Sonst zeigt/speichert das Formular Daten des vorigen Leads. */}
            <LeadProfilePanel
              key={data.lead.id}
              lead={data.lead}
              changes={data.changes}
              contacts={data.contacts}
              jobPostings={data.jobPostings}
              latestEnrichment={data.latestEnrichment}
              customStatuses={data.customStatuses}
              hq={data.hq}
              duplicates={data.duplicates}
              links={data.links}
              onBack={handleClose}
              backLabel="Schließen"
              extraRightColumn={
                <>
                  <LeadScreenshotCardClient
                    leadId={data.lead.id}
                    hasScreenshot={Boolean(data.lead.website_screenshot_path)}
                    takenAt={data.lead.website_screenshot_taken_at}
                    websiteUrl={normalizeWebsiteUrl(data.lead.website)}
                  />
                  {/* Webdesign-Ampel + Begründung — wie in der Vollansicht. Nur
                      hier (Neue-Leads-Vorschau); das CRM nutzt diesen Drawer nicht.
                      Bedingung identisch zu /leads/[id]. */}
                  {(data.lead.vertical === "webdesign" || data.lead.traffic_light_rating != null) && (
                    <LeadTrafficLightCard
                      leadId={data.lead.id}
                      rating={data.lead.traffic_light_rating}
                      score={data.lead.traffic_light_score}
                      reason={data.lead.traffic_light_reason}
                      source={data.lead.traffic_light_source}
                      ratedAt={data.lead.traffic_light_rated_at}
                    />
                  )}
                </>
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
      <div className="h-32 animate-pulse rounded bg-gray-100 dark:bg-[#1c1c1e]" />
      <div className="h-32 animate-pulse rounded bg-gray-100 dark:bg-[#1c1c1e]" />
      <div className="h-48 animate-pulse rounded bg-gray-100 dark:bg-[#1c1c1e]" />
    </div>
  );
}
