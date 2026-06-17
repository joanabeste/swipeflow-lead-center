"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Heart, ThumbsDown, Minus, X } from "lucide-react";
import type { TrafficLightRating } from "@/lib/types";
import { useToastContext } from "@/app/(dashboard)/toast-provider";
import { setTrafficLightManual } from "@/app/(dashboard)/leads/actions";
import { qualifyWithContactEnrichment } from "@/app/(dashboard)/leads/enrichment-actions";
import {
  claimQualifyWebBatch,
  extendQualifyClaims,
  type TinderCard as TinderCardData,
} from "@/app/(dashboard)/leads/qualify-claims-actions";
import { SwipeCard, type SwipeCardHandle } from "./_components/swipe-card";

interface Props {
  initialCards: TinderCardData[];
  targetStatusId: string;
}

// Wie viele einbettbare Karten wir vor dem aktuellen Index bereithalten wollen.
const LOOKAHEAD = 3;
// Parallele Einbettbarkeits-Pruefungen (jede kann bis ~5s dauern).
const MAX_CONCURRENT = 3;

/**
 * Mobile „Lead-Tinder"-Oberflaeche. Zeigt IMMER nur eine Karte, deren Website sich
 * live einbetten laesst (strikt): „keine Website" wird bereits server-seitig
 * gefiltert (`claimQualifyWebBatch`), „blockiert/nicht einbettbar" hier per
 * `/api/leads/[id]/embeddable`. Im Hintergrund werden Karten voraus geprueft, damit
 * sich das Wischen instant anfuehlt; geht der Vorrat zur Neige, wird unsichtbar
 * nachreserviert (geteilt mit dem Desktop-Cockpit).
 */
export function TinderDeck({ initialCards, targetStatusId }: Props) {
  const router = useRouter();
  const { addToast } = useToastContext();

  const [cards, setCards] = useState<TinderCardData[]>(initialCards);
  // Einbettbarkeit je Lead: true = zeigen, false = ueberspringen, undefined = offen.
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [index, setIndex] = useState(0);
  const [exhausted, setExhausted] = useState(false);

  const claimedIdsRef = useRef<Set<string>>(new Set(initialCards.map((c) => c.id)));
  const checkingRef = useRef<Set<string>>(new Set());
  const replenishingRef = useRef(false);
  const cardRef = useRef<SwipeCardHandle>(null);

  const close = useCallback(() => router.push("/leads"), [router]);

  // Sichtbarer Stapel = nur als einbettbar bestaetigte Karten, in Reihenfolge.
  const ready = useMemo(() => cards.filter((c) => checked[c.id] === true), [cards, checked]);
  const current = index < ready.length ? ready[index] : null;
  const seen = index; // bereits durchgesehene (fuer Fortschritt)

  // Nachreservieren (geteilte Reservierung mit dem Cockpit). Setzt „exhausted",
  // wenn nichts Neues mehr kommt.
  const replenish = useCallback(async () => {
    if (replenishingRef.current) return;
    replenishingRef.current = true;
    try {
      const fresh = await claimQualifyWebBatch();
      const added = fresh.filter((c) => !claimedIdsRef.current.has(c.id));
      if (added.length === 0) {
        setExhausted(true);
      } else {
        added.forEach((c) => claimedIdsRef.current.add(c.id));
        setCards((prev) => [...prev, ...added]);
      }
    } finally {
      replenishingRef.current = false;
    }
  }, []);

  // Look-ahead-Worker: prueft unbekannte Kandidaten (bis MAX_CONCURRENT parallel),
  // solange weniger als LOOKAHEAD einbettbare Karten vor dem Index liegen. Sind alle
  // Kandidaten geprueft und nichts mehr in Arbeit → nachreservieren.
  useEffect(() => {
    if (ready.length - index > LOOKAHEAD) return;
    const unchecked = cards.filter(
      (c) => checked[c.id] === undefined && !checkingRef.current.has(c.id),
    );
    if (unchecked.length === 0) {
      if (checkingRef.current.size === 0) void replenish();
      return;
    }
    const slots = MAX_CONCURRENT - checkingRef.current.size;
    for (const c of unchecked.slice(0, Math.max(0, slots))) {
      checkingRef.current.add(c.id);
      void (async () => {
        let ok = false;
        try {
          const r = await fetch(`/api/leads/${c.id}/embeddable`);
          if (r.ok) {
            const j = (await r.json()) as { embeddable?: boolean };
            ok = Boolean(j?.embeddable);
          }
        } catch {
          ok = false; // strikt: unklar → nicht zeigen
        }
        checkingRef.current.delete(c.id);
        setChecked((prev) => ({ ...prev, [c.id]: ok }));
      })();
    }
  }, [cards, checked, index, ready.length, replenish]);

  // Heartbeat: verlaengert die Reservierungen, solange die Ansicht offen ist.
  useEffect(() => {
    const iv = setInterval(() => void extendQualifyClaims(), 4 * 60_000);
    return () => clearInterval(iv);
  }, []);

  // Reservierungen beim Verlassen freigeben (Beacon ist im Unload zuverlaessig).
  useEffect(() => {
    const release = () => {
      try {
        navigator.sendBeacon("/api/qualify/release");
      } catch {
        /* best effort — TTL faengt es ab */
      }
    };
    window.addEventListener("pagehide", release);
    return () => {
      window.removeEventListener("pagehide", release);
      release();
    };
  }, []);

  // Entscheidung anwenden: optimistisch weiterspringen, im Hintergrund persistieren.
  // gruen → anreichern (Ansprechpartner + Telefon) + ins CRM; rot/orange → nur Ampel.
  const decide = useCallback(
    (card: TinderCardData, rating: TrafficLightRating) => {
      setExhausted(false); // freigewordene Kapazitaet → ggf. wieder nachreservieren
      const id = card.id;
      const qualify = rating === "green";
      if (qualify) addToast("Lead wird angereichert & qualifiziert…", "info");

      void (async () => {
        const r1 = await setTrafficLightManual(id, rating);
        if (r1 && "error" in r1 && r1.error) addToast(`Ampel: ${r1.error}`, "error");
        if (qualify) {
          const r2 = await qualifyWithContactEnrichment(id, targetStatusId, "webdev");
          if ("error" in r2) addToast(`Qualifizieren: ${r2.error}`, "error");
          else if (r2.enriched) addToast("Angereichert, qualifiziert & ins CRM", "success");
          else addToast("Qualifiziert & ins CRM übernommen", "success");
        }
      })();

      setIndex((i) => i + 1);
    },
    [addToast, targetStatusId],
  );

  const onDecision = useCallback(
    (rating: TrafficLightRating) => {
      if (current) decide(current, rating);
    },
    [current, decide],
  );

  const total = ready.length; // bekannte einbettbare Karten (waechst beim Pruefen)

  return (
    <div className="fixed inset-0 z-[80] flex touch-none flex-col overscroll-none bg-gray-50 dark:bg-[#0a0a0b]">
      {/* Kopfzeile */}
      <header className="flex shrink-0 items-center gap-3 border-b border-gray-200 px-4 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] dark:border-[#2c2c2e]">
        <button
          type="button"
          onClick={close}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
          aria-label="Schließen"
        >
          <X className="h-5 w-5" />
        </button>
        <h1 className="text-sm font-semibold">Lead-Tinder</h1>
        {current && (
          <span className="ml-auto text-xs tabular-nums text-gray-500 dark:text-gray-400">
            {seen + 1}
            {!exhausted ? "+" : ` / ${total}`}
          </span>
        )}
      </header>

      {/* Karten-Bühne */}
      {current ? (
        <>
          <div className="relative min-h-0 flex-1 p-3">
            {/* Karte hinter der aktiven (Tiefenwirkung) */}
            {ready[index + 1] && (
              <div className="absolute inset-3 -z-0 scale-[0.96] rounded-3xl border border-gray-200 bg-white opacity-60 dark:border-[#2c2c2e] dark:bg-[#161618]" />
            )}
            <SwipeCard
              key={current.id}
              ref={cardRef}
              card={current}
              onDecision={onDecision}
            />
          </div>

          {/* Aktions-Buttons (Fallback / A11y) */}
          <div className="flex shrink-0 items-center justify-center gap-5 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <ActionButton
              onClick={() => cardRef.current?.swipe("red")}
              className="border-red-200 bg-white text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:bg-[#161618] dark:hover:bg-red-900/20"
              label="Rot (nach links)"
            >
              <ThumbsDown className="h-6 w-6" />
            </ActionButton>
            <ActionButton
              onClick={() => cardRef.current?.swipe("amber")}
              className="border-orange-200 bg-white text-orange-600 hover:bg-orange-50 dark:border-orange-900/50 dark:bg-[#161618] dark:hover:bg-orange-900/20"
              label="Orange / neutral (nach oben)"
              small
            >
              <Minus className="h-5 w-5" />
            </ActionButton>
            <ActionButton
              onClick={() => cardRef.current?.swipe("green")}
              className="border-green-200 bg-white text-green-600 hover:bg-green-50 dark:border-green-900/50 dark:bg-[#161618] dark:hover:bg-green-900/20"
              label="Grün – qualifizieren (nach rechts)"
            >
              <Heart className="h-6 w-6" />
            </ActionButton>
          </div>
        </>
      ) : exhausted ? (
        <EmptyState
          title={cards.length === 0 ? "Keine Leads mit ladender Website" : "Alles durchgesehen 🎉"}
          subtitle={
            cards.length === 0
              ? "Aktuell gibt es keine Webdesign-Leads, deren Website sich live laden lässt."
              : "Du hast alle Leads mit ladender Website durchgewischt."
          }
          onClose={close}
        />
      ) : (
        <LoadingMore />
      )}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  className,
  label,
  small,
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
  label: string;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center rounded-full border-2 shadow-sm transition active:scale-95 ${
        small ? "h-12 w-12" : "h-16 w-16"
      } ${className ?? ""}`}
    >
      {children}
    </button>
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

function LoadingMore() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-primary dark:border-gray-600 dark:border-t-primary" />
      Suche Leads mit ladender Website…
    </div>
  );
}
