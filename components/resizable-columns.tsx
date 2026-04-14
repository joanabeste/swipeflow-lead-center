"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

interface Props {
  left: ReactNode;
  right: ReactNode;
  /** LocalStorage-Key für die Persistenz der Spaltenbreite */
  storageKey: string;
  /** Initial-Breite (px) der rechten Spalte, wenn nichts gespeichert ist */
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
  defaultRight = 520,
  minRight = 320,
  maxRight = 900,
}: Props) {
  const [rightWidth, setRightWidth] = useState(defaultRight);
  const [hydrated, setHydrated] = useState(false);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  // Persistenz: initial aus localStorage
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const n = parseInt(saved, 10);
      if (Number.isFinite(n)) {
        setRightWidth(Math.max(minRight, Math.min(maxRight, n)));
      }
    }
    setHydrated(true);
  }, [storageKey, minRight, maxRight]);

  useEffect(() => {
    if (!hydrated) return;
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      // Handle liegt zwischen Spalten: Maus nach links = rechte Spalte breiter
      const delta = startX.current - e.clientX;
      const next = Math.max(minRight, Math.min(maxRight, startWidth.current + delta));
      setRightWidth(next);
    }
    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try {
        localStorage.setItem(storageKey, String(Math.round(rightWidth)));
      } catch {
        // ignore quota / private mode
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [rightWidth, storageKey, minRight, maxRight, hydrated]);

  function onMouseDown(e: React.MouseEvent) {
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = rightWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-0">
      <div className="min-w-0 flex-1 space-y-6 lg:pr-4">{left}</div>

      {/* Handle — nur auf lg+ sichtbar */}
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

      <div
        className="w-full shrink-0 space-y-4 lg:w-[var(--right-w)] lg:pl-4"
        style={{ ["--right-w" as string]: `${rightWidth}px` }}
      >
        {right}
      </div>
    </div>
  );
}
