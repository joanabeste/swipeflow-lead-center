"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

interface Props {
  left: ReactNode;
  right: ReactNode;
  /** LocalStorage-Key für die Persistenz der Spaltenbreite */
  storageKey: string;
  /** Welche Seite feste Breite hat — die andere füllt flex-1 */
  fixedSide?: "left" | "right";
  /** Initial-Breite (px) der fixen Spalte, wenn nichts gespeichert ist */
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  /** @deprecated — alte API, nur wenn fixedSide="right" */
  defaultRight?: number;
  minRight?: number;
  maxRight?: number;
}

/**
 * Zwei-Spalten-Layout mit vertikalem Resize-Handle zwischen den Spalten.
 * Linke Spalte füllt den Rest (min-w-0 für korrektes Schrumpfen).
 * Mobile (<lg): stackt untereinander, kein Handle.
 */
export function ResizableColumns({
  left,
  right,
  storageKey,
  fixedSide = "right",
  defaultWidth,
  minWidth,
  maxWidth,
  // Rückwärtskompatibilität
  defaultRight,
  minRight,
  maxRight,
}: Props) {
  const effectiveDefault = defaultWidth ?? defaultRight ?? 520;
  const effectiveMin = minWidth ?? minRight ?? 320;
  const effectiveMax = maxWidth ?? maxRight ?? 900;

  const [width, setWidth] = useState(effectiveDefault);
  const [hydrated, setHydrated] = useState(false);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  // Mount-only: localStorage-Breite nachladen, danach setHydrated. setState im
  // Effect ist hier bewusst — Alternative wäre Server/Client-Mismatch.
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const n = parseInt(saved, 10);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Number.isFinite(n)) setWidth(Math.max(effectiveMin, Math.min(effectiveMax, n)));
    }
    setHydrated(true);
  }, [storageKey, effectiveMin, effectiveMax]);

  useEffect(() => {
    if (!hydrated) return;
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      // fixedSide='right': Maus nach links (negative delta) macht rechte Spalte breiter
      // fixedSide='left':  Maus nach rechts (positive delta) macht linke Spalte breiter
      const raw = e.clientX - startX.current;
      const delta = fixedSide === "right" ? -raw : raw;
      const next = Math.max(effectiveMin, Math.min(effectiveMax, startWidth.current + delta));
      setWidth(next);
    }
    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try {
        localStorage.setItem(storageKey, String(Math.round(width)));
      } catch {
        // ignore
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [width, storageKey, effectiveMin, effectiveMax, hydrated, fixedSide]);

  function onMouseDown(e: React.MouseEvent) {
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  const fixedClass = "w-full shrink-0 lg:w-[var(--fixed-w)]";
  const fixedStyle = { ["--fixed-w" as string]: `${width}px` };
  const flexClass = "min-w-0 flex-1";

  if (fixedSide === "left") {
    return (
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-0">
        <div className={`${fixedClass} space-y-4 lg:pr-4`} style={fixedStyle}>
          {left}
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={onMouseDown}
          className="group relative hidden shrink-0 cursor-col-resize lg:block"
          style={{ width: 8 }}
          title="Zum Resize ziehen"
        >
          <div className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 rounded bg-gray-200 transition group-hover:bg-primary dark:bg-[#2c2c2e]" />
        </div>
        <div className={`${flexClass} space-y-4 lg:pl-4`}>{right}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-0">
      <div className={`${flexClass} space-y-6 lg:pr-4`}>{left}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={onMouseDown}
        className="group relative hidden shrink-0 cursor-col-resize lg:block"
        style={{ width: 8 }}
        title="Zum Resize ziehen"
      >
        <div className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 rounded bg-gray-200 transition group-hover:bg-primary dark:bg-[#2c2c2e]" />
      </div>
      <div className={`${fixedClass} space-y-4 lg:pl-4`} style={fixedStyle}>
        {right}
      </div>
    </div>
  );
}
