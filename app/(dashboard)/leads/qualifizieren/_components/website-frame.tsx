"use client";

import { useEffect, useState } from "react";
import { Camera, ExternalLink, Globe, Monitor, RotateCw } from "lucide-react";
import { normalizeWebsiteUrl } from "@/lib/website-url";

interface Props {
  leadId: string;
  /** Roh-URL aus dem Lead (lead.website). */
  website: string | null;
  hasScreenshot: boolean;
}

type Mode = "live" | "screenshot";

/**
 * Großflächige Website-Vorschau im Qualifizierungs-Cockpit.
 *
 * Live-`<iframe>` ist Default. Beim Lead-Wechsel prüft `/api/leads/[id]/embeddable`
 * serverseitig X-Frame-Options/CSP — verbietet die Seite direktes Einbetten, lädt
 * das iframe die Seite über den Reverse-Proxy `/api/site-proxy` (Sperr-Header
 * entfernt, sandboxed). So bleibt die Live-Ansicht auch für blockierende Seiten
 * sichtbar. Der Screenshot bleibt als manuelle Alternative im Toggle.
 */
export function WebsiteFrame({ leadId, website, hasScreenshot }: Props) {
  const url = normalizeWebsiteUrl(website);
  // Standardmäßig IMMER Live-Ansicht. Wichtig: das Cockpit mountet WebsiteFrame
  // bereits, bevor das Lead-Bundle geladen ist (website ist dann noch null). Der
  // Init darf daher NICHT von `url` abhängen — sonst bliebe der Toggle auf
  // "screenshot" hängen, sobald die URL nachträglich eintrifft. Fehlt die URL,
  // zeigt der Render unten ohnehin den Platzhalter (noch vor der Modus-Auswahl).
  // key={leadId} im Cockpit → frischer Mount je Lead, daher kein Reset-Effekt.
  const [mode, setMode] = useState<Mode>("live");
  const [checking, setChecking] = useState<boolean>(Boolean(url));
  const [blocked, setBlocked] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const [shotError, setShotError] = useState(false);

  // Einbettbarkeit serverseitig prüfen; bei Block-Verdacht nur Hinweis setzen.
  // Nur setState in Callbacks (nicht synchron im Effekt-Body).
  useEffect(() => {
    if (!url) return;
    const ac = new AbortController();
    fetch(`/api/leads/${leadId}/embeddable`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { embeddable: boolean } | null) => {
        if (ac.signal.aborted || !j) return;
        if (!j.embeddable) setBlocked(true);
      })
      .catch(() => {})
      .finally(() => {
        if (!ac.signal.aborted) setChecking(false);
      });
    return () => ac.abort();
  }, [leadId, url]);

  // Screenshot-URL lazy laden, sobald der Screenshot-Modus aktiv ist.
  useEffect(() => {
    if (mode !== "screenshot" || !hasScreenshot || shotUrl) return;
    const ac = new AbortController();
    fetch(`/api/leads/${leadId}/screenshot-url`, { cache: "no-store", signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { url: string | null } | null) => {
        if (ac.signal.aborted) return;
        if (!j?.url) setShotError(true);
        else setShotUrl(j.url);
      })
      .catch(() => {
        if (!ac.signal.aborted) setShotError(true);
      });
    return () => ac.abort();
  }, [mode, hasScreenshot, leadId, shotUrl]);

  function toggle(next: Mode) {
    setMode(next);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-gray-100 dark:bg-[#0a0a0b]">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 py-2 dark:border-[#2c2c2e] dark:bg-[#161618]">
        <Globe className="h-4 w-4 shrink-0 text-gray-400" />
        <span className="min-w-0 flex-1 truncate text-xs text-gray-600 dark:text-gray-300">
          {url ?? "Keine Website hinterlegt"}
        </span>

        {url && (
          <div className="flex shrink-0 items-center gap-1">
            {/* Live/Screenshot-Umschalter */}
            <div className="flex overflow-hidden rounded-md border border-gray-200 dark:border-[#2c2c2e]">
              <button
                type="button"
                onClick={() => toggle("live")}
                className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium transition ${
                  mode === "live"
                    ? "bg-primary text-gray-900"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
                }`}
                title="Live-Ansicht"
              >
                <Monitor className="h-3.5 w-3.5" /> Live
              </button>
              <button
                type="button"
                onClick={() => toggle("screenshot")}
                disabled={!hasScreenshot}
                className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  mode === "screenshot"
                    ? "bg-primary text-gray-900"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
                }`}
                title={hasScreenshot ? "Screenshot" : "Kein Screenshot vorhanden"}
              >
                <Camera className="h-3.5 w-3.5" /> Screenshot
              </button>
            </div>

            {mode === "live" && (
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
                title="Neu laden"
              >
                <RotateCw className="h-3.5 w-3.5" />
              </button>
            )}
            <a
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
              title="In neuem Tab öffnen"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        )}
      </div>

      {/* Inhalt */}
      <div className="relative min-h-0 flex-1">
        {!url ? (
          <Placeholder text="Für diesen Lead ist keine Website hinterlegt." />
        ) : mode === "live" ? (
          <>
            <iframe
              // blocked im key → sauberer Remount beim Wechsel direkt↔Proxy.
              key={`${leadId}-${reloadKey}-${blocked ? "proxy" : "direct"}`}
              src={blocked ? `/api/site-proxy?url=${encodeURIComponent(url)}` : url}
              title="Lead-Website"
              referrerPolicy="no-referrer"
              // Proxy-Inhalt ohne allow-same-origin → null-Origin, kein Zugriff auf
              // unsere Cookies/Storage.
              sandbox={blocked ? "allow-scripts allow-forms allow-popups" : undefined}
              className="h-full w-full border-0 bg-white"
            />
            {checking && (
              <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">
                Prüfe Einbettbarkeit…
              </div>
            )}
            {blocked && !checking && (
              <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-amber-400/95 px-2 py-0.5 text-[11px] font-medium text-gray-900">
                Live (Proxy)
              </div>
            )}
          </>
        ) : shotUrl ? (
          <div className="h-full w-full overflow-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shotUrl} alt="Website-Screenshot" className="block w-full" />
          </div>
        ) : shotError || !hasScreenshot ? (
          <Placeholder text="Diese Seite verbietet das Einbetten und es liegt kein Screenshot vor. Bitte oben rechts in neuem Tab öffnen." />
        ) : (
          <Placeholder text="Screenshot wird geladen…" />
        )}
      </div>
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center">
      <p className="max-w-md text-sm text-gray-500 dark:text-gray-400">{text}</p>
    </div>
  );
}
