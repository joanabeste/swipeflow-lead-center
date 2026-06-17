"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import {
  TRAFFIC_LIGHT_OPTIONS,
  type CustomLeadStatus,
  type Lead,
  type LeadContact,
  type TrafficLightRating,
} from "@/lib/types";
import type { LeadDetailBundle } from "@/lib/leads/load-lead-detail";
import type { QualifyHotkeySettings } from "@/lib/app-settings";
import { normalizeWebsiteUrl } from "@/lib/website-url";
import { prefetchNeighbors } from "@/lib/preview/prefetch";
import { useToastContext } from "@/app/(dashboard)/toast-provider";
import {
  qualifyAllGreen,
  setTrafficLightManual,
} from "@/app/(dashboard)/leads/actions";
import { qualifyWithContactEnrichment } from "@/app/(dashboard)/leads/enrichment-actions";
import { WebsiteFrame } from "./_components/website-frame";
import { QuickNote } from "./_components/quick-note";
import { QualifySettings } from "./_components/qualify-settings";
import { ContactsCard } from "./_components/contacts-card";
import { StammdatenCard } from "./_components/stammdaten-card";

export interface QueueItem {
  id: string;
  rating: TrafficLightRating | null;
}

type FilterValue = "all" | TrafficLightRating | "none";

interface Props {
  queue: QueueItem[];
  statuses: CustomLeadStatus[];
  initialSettings: QualifyHotkeySettings;
}

// Tasten-Zuordnung Ziffer → Ampel. green wird (je nach Einstellung) zusätzlich
// qualifiziert.
const KEY_TO_RATING: Record<string, TrafficLightRating> = {
  "1": "green",
  "2": "amber",
  "3": "red",
};

export function QualifyCockpit({ queue: initialQueue, statuses, initialSettings }: Props) {
  const router = useRouter();
  const { addToast } = useToastContext();

  // Eingefrorener Queue-Snapshot vom ersten Render. WICHTIG: Next refresht die
  // Route nach jeder Server-Action (Bewerten/Qualifizieren) automatisch → die
  // neue queue-Prop ist neu sortiert/gefiltert (qualifizierte raus, rote ans
  // Ende). Würden wir die live nutzen, verschöbe sich die Liste unter dem Index
  // und es würde ein Lead übersprungen. Deshalb navigieren wir über diesen
  // stabilen Snapshot; Bewertungs-Anzeige läuft über die ratings/qualified-Overlays.
  const [queue] = useState(initialQueue);

  const [settings, setSettings] = useState(initialSettings);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [index, setIndex] = useState(0);
  const [data, setData] = useState<LeadDetailBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Optimistische Overlays, damit Bewertung/Qualifizierung sofort sichtbar ist,
  // ohne auf den Server zu warten.
  const [ratings, setRatings] = useState<Record<string, TrafficLightRating>>({});
  const [qualified, setQualified] = useState<Set<string>>(() => new Set());
  const abortRef = useRef<AbortController | null>(null);

  // Anzahl je Ampel-Wert (für die Filter-Labels).
  const counts = useMemo(() => {
    const c = { all: queue.length, green: 0, amber: 0, red: 0, none: 0 };
    for (const q of queue) {
      if (q.rating == null) c.none++;
      else c[q.rating]++;
    }
    return c;
  }, [queue]);

  // Sichtbare Queue nach Filter. Membership richtet sich nach der ursprünglichen
  // Ampel (Snapshot) — eine spätere Neubewertung lässt den aktuellen Lead nicht
  // unter dir verschwinden.
  const filteredIds = useMemo(
    () =>
      queue
        .filter((q) =>
          filter === "all"
            ? true
            : filter === "none"
              ? q.rating == null
              : q.rating === filter,
        )
        .map((q) => q.id),
    [queue, filter],
  );

  const total = filteredIds.length;
  const currentId = index < total ? filteredIds[index] : null;
  const done = total > 0 && index >= total;

  function changeFilter(next: FilterValue) {
    setFilter(next);
    setIndex(0);
  }

  // Bundle für den aktuellen Lead laden (Muster wie der Schnellansicht-Drawer).
  // setState im Effect ist hier bewusst (externer Datenladevorgang) — analog zum
  // projektweiten Pattern in lead-preview-drawer.tsx.
  useEffect(() => {
    if (!currentId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(null);
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    fetch(`/api/leads/${currentId}/preview`, { signal: ac.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`Status ${r.status}`);
        return r.json() as Promise<LeadDetailBundle>;
      })
      .then((bundle) => {
        if (!ac.signal.aborted) setData(bundle);
      })
      .catch((e: unknown) => {
        if (!ac.signal.aborted) setError(e instanceof Error ? e.message : "Unbekannter Fehler");
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [currentId]);

  // Nachbarn idle-prefetchen → Blättern fühlt sich instant an.
  useEffect(() => {
    if (currentId) prefetchNeighbors(filteredIds, currentId, "leads", 2);
  }, [currentId, filteredIds]);

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setIndex((i) => Math.min(total, i + 1)), [total]);
  const close = useCallback(() => router.push("/leads"), [router]);

  // Optimistisch geaenderte Ansprechpartner ins gerade geladene Bundle spiegeln
  // (das Cockpit laedt es per /api/leads/[id]/preview und refresht sonst nicht).
  const handleContactsChange = useCallback((next: LeadContact[]) => {
    setData((d) => (d ? { ...d, contacts: next } : d));
  }, []);

  // Gespeicherte Stammdaten optimistisch ins Bundle spiegeln (Titel, Website,
  // Stammdaten-Karte aktualisieren sich sofort, ohne erneutes Laden).
  const handleStammdatenChange = useCallback((patch: Partial<Lead>) => {
    setData((d) => (d ? { ...d, lead: { ...d.lead, ...patch } } : d));
  }, []);

  const rate = useCallback(
    (rating: TrafficLightRating) => {
      const id = currentId;
      if (!id) return;
      const qualify = rating === "green" && settings.immediateQualify;

      // optimistisch
      setRatings((m) => ({ ...m, [id]: rating }));
      if (qualify) setQualified((s) => new Set(s).add(id));

      // Hat der aktuell geladene Lead (Bundle) noch keinen Ansprechpartner? Dann
      // reichert das Verschieben unten zuerst an — Hinweis sofort, da das ein paar
      // Sekunden dauert und im Hintergrund läuft.
      const knownNoContact =
        qualify && !!data && data.lead.id === id && (data.contacts?.length ?? 0) === 0;
      if (knownNoContact) addToast("Kein Ansprechpartner – Lead wird angereichert…", "info");

      // im Hintergrund persistieren (blockiert das Weiterspringen nicht)
      void (async () => {
        const r1 = await setTrafficLightManual(id, rating);
        if (r1 && "error" in r1 && r1.error) {
          addToast(`Ampel: ${r1.error}`, "error");
        }
        if (qualify) {
          // Reichert vorher an, falls kein Ansprechpartner vorhanden ist (Server
          // prüft DB-seitig), und verschiebt dann ins CRM.
          const r2 = await qualifyWithContactEnrichment(id, settings.targetStatusId, "webdev");
          if ("error" in r2) addToast(`Qualifizieren: ${r2.error}`, "error");
          else if (r2.enriched) addToast("Angereichert, qualifiziert & ins CRM", "success");
          else addToast("Qualifiziert & ins CRM übernommen", "success");
        }
      })();

      goNext();
    },
    [currentId, settings, addToast, goNext, data],
  );

  // Zentrales Tastatur-Handling. Deaktiviert, solange der Fokus in einem
  // Eingabefeld liegt (Notizfeld, Status-Select) — sonst würde Tippen bewerten.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;

      if (e.key in KEY_TO_RATING) {
        e.preventDefault();
        rate(KEY_TO_RATING[e.key]);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "Escape") {
        close();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rate, goNext, goPrev, close]);

  function handleQualifyAllGreen() {
    void (async () => {
      const res = await qualifyAllGreen();
      if ("error" in res) addToast(`Fehler: ${res.error}`, "error");
      else if (res.count === 0) addToast("Keine grünen Leads zum Qualifizieren.", "info");
      else addToast(`${res.count} grüne Leads qualifiziert.`, "success");
    })();
  }

  const lead = data && data.lead.id === currentId ? data.lead : null;
  const effectiveRating: TrafficLightRating | null = currentId
    ? ratings[currentId] ?? lead?.traffic_light_rating ?? null
    : null;
  const isQualified = currentId ? qualified.has(currentId) : false;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-white dark:bg-[#0a0a0b]">
      {/* Kopfzeile mit Tasten-Legende */}
      <header className="flex shrink-0 items-center gap-3 border-b border-gray-200 px-4 py-2.5 dark:border-[#2c2c2e]">
        <button
          type="button"
          onClick={close}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
          title="Schließen (Esc)"
        >
          <X className="h-4.5 w-4.5" />
        </button>
        <h1 className="text-sm font-semibold">Lead-Qualifizierung</h1>

        {/* Ampel-Filter: welche Leads angezeigt werden */}
        <select
          value={filter}
          onChange={(e) => changeFilter(e.target.value as FilterValue)}
          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#161618] dark:text-gray-200"
          title="Anzeige filtern"
        >
          <option value="all">Alle ({counts.all})</option>
          <option value="green">🟢 Grün ({counts.green})</option>
          <option value="amber">🟠 Orange ({counts.amber})</option>
          <option value="red">🔴 Rot ({counts.red})</option>
          <option value="none">⚪ Unbewertet ({counts.none})</option>
        </select>

        {total > 0 && !done && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={goPrev}
              disabled={index === 0}
              aria-label="Vorheriger Lead"
              title="Vorheriger Lead (←)"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30 dark:text-gray-400 dark:hover:bg-white/5"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-1 text-xs tabular-nums text-gray-500 dark:text-gray-400">
              {index + 1} / {total}
            </span>
            <button
              type="button"
              onClick={goNext}
              aria-label="Nächster Lead"
              title="Nächster Lead (→)"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Legend />
          {!settings.immediateQualify && (
            <button
              type="button"
              onClick={handleQualifyAllGreen}
              className="rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300"
              title="Alle grün markierten Webdesign-Leads qualifizieren"
            >
              Alle grünen qualifizieren
            </button>
          )}
          <QualifySettings statuses={statuses} settings={settings} onChange={setSettings} />
        </div>
      </header>

      {/* Inhalt */}
      {total === 0 ? (
        <EmptyState
          title={queue.length === 0 ? "Keine offenen Webdesign-Leads" : "Keine Leads mit diesem Filter"}
          subtitle={
            queue.length === 0
              ? "Aktuell gibt es keine neuen Webdesign-Leads zum Qualifizieren."
              : "Für diesen Ampel-Filter gibt es gerade keine Leads. Wähle oben einen anderen Filter."
          }
          onClose={close}
        />
      ) : done ? (
        <EmptyState
          title="Alles durchgesehen 🎉"
          subtitle={`Du hast alle ${total} Leads dieser Queue bearbeitet.`}
          onClose={close}
        />
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Website links */}
          <div className="min-w-0 flex-1">
            {currentId && (
              <WebsiteFrame
                key={currentId}
                leadId={currentId}
                website={lead?.website ?? null}
                hasScreenshot={Boolean(lead?.website_screenshot_path)}
              />
            )}
          </div>

          {/* Info-Spalte rechts */}
          <aside className="flex w-[400px] shrink-0 flex-col overflow-y-auto border-l border-gray-200 bg-gray-50 p-4 dark:border-[#2c2c2e] dark:bg-[#161618]">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                Fehler beim Laden: {error}
              </div>
            )}
            {!lead && loading && <ColumnSkeleton />}
            {lead && (
              <div className="space-y-4">
                {/* Lead-Titel */}
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold tracking-tight">{lead.company_name}</h2>
                    {lead.company_name && (
                      <a
                        href={`https://www.google.com/search?q=${encodeURIComponent(lead.company_name)}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        title="Bei Google suchen"
                        aria-label={`„${lead.company_name}" bei Google suchen`}
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5 dark:hover:text-gray-200"
                      >
                        <Search className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {isQualified && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300">
                        <CheckCircle2 className="h-3 w-3" /> Qualifiziert
                      </span>
                    )}
                  </div>
                  {normalizeWebsiteUrl(lead.website) && (
                    <a
                      href={normalizeWebsiteUrl(lead.website)!}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-xs text-primary hover:underline"
                    >
                      {normalizeWebsiteUrl(lead.website)}
                    </a>
                  )}
                </div>

                {/* Bewerten */}
                <RatingButtons
                  current={effectiveRating}
                  immediateQualify={settings.immediateQualify}
                  onRate={rate}
                />

                {/* Webdesign-Ampel-Notiz */}
                <AmpelCard rating={effectiveRating} lead={lead} />

                {/* Notizen — key={lead.id}: frischer Mount je Lead */}
                <QuickNote key={lead.id} leadId={lead.id} notes={data?.notes ?? []} />

                {/* Stammdaten — lesbar + bearbeitbar */}
                <StammdatenCard
                  key={lead.id}
                  leadId={lead.id}
                  lead={lead}
                  onChange={handleStammdatenChange}
                />

                {/* Ansprechpartner — anlegen / bearbeiten / loeschen */}
                <ContactsCard
                  key={lead.id}
                  leadId={lead.id}
                  contacts={data?.contacts ?? []}
                  onChange={handleContactsChange}
                />
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

// ─── Tasten-Legende ─────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="hidden items-center gap-1.5 text-xs text-gray-500 lg:flex dark:text-gray-400">
      <Kbd>1</Kbd> Grün
      <Kbd>2</Kbd> Orange
      <Kbd>3</Kbd> Rot
      <span className="mx-1 text-gray-300 dark:text-gray-600">|</span>
      <Kbd>←</Kbd>
      <Kbd>→</Kbd> Wechseln
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.4rem] items-center justify-center rounded border border-gray-300 bg-gray-100 px-1 py-0.5 font-mono text-[11px] text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
      {children}
    </kbd>
  );
}

// ─── Bewertungs-Buttons ─────────────────────────────────────────────────

function RatingButtons({
  current,
  immediateQualify,
  onRate,
}: {
  current: TrafficLightRating | null;
  immediateQualify: boolean;
  onRate: (r: TrafficLightRating) => void;
}) {
  const keyByValue: Record<TrafficLightRating, string> = { green: "1", amber: "2", red: "3" };
  return (
    <div className="grid grid-cols-3 gap-2">
      {TRAFFIC_LIGHT_OPTIONS.map((o) => {
        const isActive = current === o.value;
        const label =
          o.value === "green" && immediateQualify ? "Qualifizieren" : o.label;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onRate(o.value)}
            className={`flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-3 text-sm font-semibold transition ${
              isActive ? o.color : "border-gray-200 bg-white hover:bg-gray-50 dark:border-[#2c2c2e] dark:bg-[#1c1c1e] dark:hover:bg-white/5"
            } ${isActive ? "border-transparent" : ""}`}
          >
            <span className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${o.dot}`} />
              {label}
            </span>
            <Kbd>{keyByValue[o.value]}</Kbd>
          </button>
        );
      })}
    </div>
  );
}

// ─── Ampel-Notiz ────────────────────────────────────────────────────────

function AmpelCard({ rating, lead }: { rating: TrafficLightRating | null; lead: Lead }) {
  const opt = rating ? TRAFFIC_LIGHT_OPTIONS.find((o) => o.value === rating) : null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Webdesign-Ampel</h3>
        {opt ? (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${opt.color}`}>
            <span className={`h-2 w-2 rounded-full ${opt.dot}`} />
            {opt.label}
          </span>
        ) : (
          <span className="text-xs text-gray-400">Noch nicht bewertet</span>
        )}
      </div>
      {lead.traffic_light_reason ? (
        <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">
          {lead.traffic_light_reason}
        </p>
      ) : (
        <p className="mt-2 text-sm text-gray-400">Keine Begründung hinterlegt.</p>
      )}
    </div>
  );
}

// ─── Hilfs-Komponenten ──────────────────────────────────────────────────

function ColumnSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-7 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-[#2c2c2e]" />
      <div className="h-20 animate-pulse rounded-xl bg-gray-100 dark:bg-[#1c1c1e]" />
      <div className="h-28 animate-pulse rounded-xl bg-gray-100 dark:bg-[#1c1c1e]" />
      <div className="h-32 animate-pulse rounded-xl bg-gray-100 dark:bg-[#1c1c1e]" />
    </div>
  );
}

function EmptyState({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <CheckCircle2 className="h-10 w-10 text-green-500" />
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
      <button
        type="button"
        onClick={onClose}
        className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-primary-dark"
      >
        Zurück zu den Leads
      </button>
    </div>
  );
}
