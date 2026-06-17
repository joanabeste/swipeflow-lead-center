"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { ExternalLink, Globe } from "lucide-react";
import { TRAFFIC_LIGHT_OPTIONS, type TrafficLightRating } from "@/lib/types";
import { normalizeWebsiteUrl } from "@/lib/website-url";
import type { TinderCard } from "@/app/(dashboard)/leads/qualify-claims-actions";

// Wisch-Schwellen (px), ab denen ein Release als Entscheidung zaehlt.
const COMMIT_X = 95; // horizontal: rechts = gruen, links = rot
const COMMIT_Y = 110; // hoch = orange (Tinder-„Superlike")

export interface SwipeCardHandle {
  /** Loest dieselbe Wisch-Animation + Entscheidung aus wie eine echte Geste
   *  (fuer die Fallback-Buttons unter der Karte). */
  swipe: (rating: TrafficLightRating) => void;
}

interface Props {
  card: TinderCard;
  /** Wird nach Abschluss der Wisch-Animation mit der gewaehlten Ampel aufgerufen. */
  onDecision: (rating: TrafficLightRating) => void;
}

/**
 * Eine wischbare Lead-Karte (Tinder-Stil). Zeigt die Website live im `<iframe>`
 * (nur optische Beurteilung — `pointer-events:none`, daher treffen alle Gesten
 * die Karte selbst, ohne dass das iframe sie schluckt). Rechts → gruen, links →
 * rot, hoch → orange. Reine Pointer-Gesten, keine externe Lib.
 */
export const SwipeCard = forwardRef<SwipeCardHandle, Props>(function SwipeCard(
  { card, onDecision },
  ref,
) {
  const url = normalizeWebsiteUrl(card.website);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [flyOut, setFlyOut] = useState<TrafficLightRating | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const decidedRef = useRef(false);

  const commit = useCallback((rating: TrafficLightRating) => {
    setFlyOut((prev) => prev ?? rating); // erste Entscheidung gewinnt
  }, []);

  useImperativeHandle(ref, () => ({ swipe: commit }), [commit]);

  function onPointerDown(e: React.PointerEvent) {
    if (flyOut) return;
    startRef.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* setPointerCapture kann in seltenen Faellen werfen — unkritisch */
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!startRef.current) return;
    const next = { x: e.clientX - startRef.current.x, y: e.clientY - startRef.current.y };
    posRef.current = next;
    setPos(next);
  }

  function endDrag() {
    if (!startRef.current) return;
    startRef.current = null;
    setDragging(false);
    const { x, y } = posRef.current;
    // Horizontal hat Vorrang; vertikal zaehlt nur nach OBEN (orange).
    if (Math.abs(x) > Math.abs(y) && Math.abs(x) > COMMIT_X) {
      commit(x > 0 ? "green" : "red");
    } else if (-y > COMMIT_Y) {
      commit("amber");
    } else {
      posRef.current = { x: 0, y: 0 };
      setPos({ x: 0, y: 0 }); // zurueckfedern
    }
  }

  function onTransitionEnd() {
    if (flyOut && !decidedRef.current) {
      decidedRef.current = true;
      onDecision(flyOut);
    }
  }

  // Transform: entweder Flug nach aussen (committed) oder aktueller Drag-Versatz.
  const transform = flyOut
    ? flyOut === "green"
      ? "translate3d(140vw,0,0) rotate(22deg)"
      : flyOut === "red"
        ? "translate3d(-140vw,0,0) rotate(-22deg)"
        : "translate3d(0,-140vh,0)"
    : `translate3d(${pos.x}px, ${pos.y}px, 0) rotate(${pos.x / 18}deg)`;

  // Deckkraft der Richtungs-Badges (0..1), proportional zur Wischweite.
  const horizDominant = Math.abs(pos.x) >= Math.abs(pos.y);
  const greenOp = flyOut === "green" ? 1 : !flyOut && horizDominant && pos.x > 0 ? Math.min(1, pos.x / COMMIT_X) : 0;
  const redOp = flyOut === "red" ? 1 : !flyOut && horizDominant && pos.x < 0 ? Math.min(1, -pos.x / COMMIT_X) : 0;
  const amberOp = flyOut === "amber" ? 1 : !flyOut && !horizDominant && pos.y < 0 ? Math.min(1, -pos.y / COMMIT_Y) : 0;

  const opt = card.rating ? TRAFFIC_LIGHT_OPTIONS.find((o) => o.value === card.rating) : null;

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onTransitionEnd={onTransitionEnd}
      className="absolute inset-0 flex touch-none flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl select-none dark:border-[#2c2c2e] dark:bg-[#161618]"
      style={{
        transform,
        transition: dragging ? "none" : "transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)",
        opacity: flyOut ? 0 : 1,
        willChange: "transform",
      }}
    >
      {/* Website-Vorschau (nur optisch — keine Interaktion) */}
      <div className="relative min-h-0 flex-1 bg-gray-100 dark:bg-[#0a0a0b]">
        {url ? (
          <iframe
            src={url}
            title={card.company_name}
            referrerPolicy="no-referrer"
            // pointer-events:none → Gesten treffen die Karte, nicht das iframe.
            className="pointer-events-none h-full w-full border-0 bg-white"
          />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-gray-400">
            Keine Website hinterlegt.
          </div>
        )}

        {/* Richtungs-Badges */}
        <Badge className="left-4 top-4 border-green-500 text-green-600" style={{ opacity: greenOp, transform: "rotate(-12deg)" }}>
          GRÜN
        </Badge>
        <Badge className="right-4 top-4 border-red-500 text-red-600" style={{ opacity: redOp, transform: "rotate(12deg)" }}>
          ROT
        </Badge>
        <Badge className="left-1/2 top-4 -translate-x-1/2 border-orange-500 text-orange-600" style={{ opacity: amberOp }}>
          ORANGE
        </Badge>
      </div>

      {/* Kopf: Firmenname + Link in neuem Tab (ueber dem iframe, antippbar) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-2 bg-gradient-to-b from-black/55 to-transparent p-4 pb-8 text-white">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-bold tracking-tight drop-shadow">{card.company_name}</h2>
          {url && (
            <div className="mt-0.5 flex items-center gap-1 text-xs text-white/80">
              <Globe className="h-3 w-3 shrink-0" />
              <span className="truncate">{url.replace(/^https?:\/\//, "")}</span>
            </div>
          )}
        </div>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            onPointerDown={(e) => e.stopPropagation()}
            className="pointer-events-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white backdrop-blur-sm transition hover:bg-white/25"
            title="In neuem Tab öffnen"
            aria-label="Website in neuem Tab öffnen"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>

      {/* Fuss: bisherige KI-Ampel + Begruendung (Kontext fuer die Entscheidung) */}
      {(opt || card.reason) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-4 pt-10 text-white">
          {opt && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-xs font-medium backdrop-blur-sm">
              <span className={`h-2 w-2 rounded-full ${opt.dot}`} />
              KI-Ampel: {opt.label}
            </span>
          )}
          {card.reason && (
            <p className="mt-1.5 line-clamp-3 text-xs leading-snug text-white/85 drop-shadow">{card.reason}</p>
          )}
        </div>
      )}
    </div>
  );
});

function Badge({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`pointer-events-none absolute rounded-xl border-4 bg-white/85 px-3 py-1 text-xl font-extrabold backdrop-blur-sm ${className ?? ""}`}
      style={{ transition: "opacity 0.1s linear", ...style }}
    >
      {children}
    </div>
  );
}
