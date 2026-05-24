"use client";

import { useEffect, useState } from "react";
import { Camera } from "lucide-react";

interface Props {
  /** Vorberechnete signed URL (server-seitig). null bedeutet: kein Screenshot. */
  signedUrl?: string | null;
  /** Alternative: leadId + hasScreenshot — signed URL wird dann lazy nachgeladen,
   *  damit das Bundle nicht aufs Supabase-Storage-Signing warten muss. */
  leadId?: string;
  hasScreenshot?: boolean;
  takenAt: string | null;
  websiteUrl: string | null;
}

/** Reine Client-Variante der Screenshot-Card. Erwartet die signed URL als Prop,
 *  damit kein server-only Modul (lib/enrichment/screenshot) in den Client-Bundle
 *  gezogen wird (sonst landet playwright im Browser-Bundle). */
export function LeadScreenshotCardClient({ signedUrl, leadId, hasScreenshot, takenAt, websiteUrl }: Props) {
  const [lazyUrl, setLazyUrl] = useState<string | null>(null);

  // Lazy-Modus: leadId + hasScreenshot gesetzt, kein signedUrl vorab.
  useEffect(() => {
    if (signedUrl != null) return;
    if (!leadId || !hasScreenshot) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLazyUrl(null);
    fetch(`/api/leads/${leadId}/screenshot-url`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { url: string | null } | null) => {
        if (cancelled || !j) return;
        setLazyUrl(j.url);
      })
      .catch((err) => {
        if (!cancelled) console.warn("[lead-screenshot] signed-url fetch failed:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [signedUrl, leadId, hasScreenshot]);

  const effectiveUrl = signedUrl ?? lazyUrl;
  if (!effectiveUrl) return null;

  const captionDate = takenAt
    ? new Date(takenAt).toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      <h2 className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400">
        <Camera className="h-3.5 w-3.5" />
        Website-Screenshot
      </h2>
      <a
        href={websiteUrl ?? effectiveUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-3 block overflow-hidden rounded-md border border-gray-200 transition hover:opacity-90 dark:border-[#2c2c2e]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={effectiveUrl}
          alt="Screenshot der Website"
          loading="lazy"
          className="block h-auto w-full"
        />
      </a>
      {captionDate && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Aufgenommen am {captionDate}
        </p>
      )}
    </div>
  );
}
