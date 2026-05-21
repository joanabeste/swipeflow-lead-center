"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Default-Breite in px, wenn nichts in localStorage liegt. */
  defaultWidth?: number;
  /** localStorage-Key zur Persistenz der user-gewaehlten Breite. */
  storageKey?: string;
  minWidth?: number;
  maxWidth?: number;
  title?: ReactNode;
  /** Rechts neben dem Titel, vor dem X-Close-Button. */
  headerExtras?: ReactNode;
  children: ReactNode;
}

const MOBILE_BREAKPOINT = 768;

export function Drawer({
  open,
  onClose,
  defaultWidth = 880,
  storageKey,
  minWidth = 480,
  maxWidth = 1200,
  title,
  headerExtras,
  children,
}: DrawerProps) {
  const [mounted, setMounted] = useState(false);
  const [width, setWidth] = useState(defaultWidth);
  const [isMobile, setIsMobile] = useState(false);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  // Mount-only: hydrate isMobile + persistierte Breite aus localStorage.
  // setState im Effect ist hier bewusst — Alternative waere Server/Client-Mismatch.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    if (storageKey) {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? Number(raw) : NaN;
      if (Number.isFinite(parsed) && parsed >= minWidth && parsed <= maxWidth) {
         
        setWidth(parsed);
      }
    }
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [storageKey, minWidth, maxWidth]);

  // ESC schliesst, Body-Scroll-Lock waehrend offen.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    if (isMobile) return;
    e.preventDefault();
    dragState.current = { startX: e.clientX, startWidth: width };
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
  }

  function onResizeMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragState.current) return;
    const delta = dragState.current.startX - e.clientX;
    const next = Math.max(minWidth, Math.min(maxWidth, dragState.current.startWidth + delta));
    setWidth(next);
  }

  function endResize(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragState.current) return;
    dragState.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Pointer wurde bereits freigegeben (z.B. nach unmount). Ignorieren.
    }
    if (storageKey) {
      window.localStorage.setItem(storageKey, String(width));
    }
  }

  if (!mounted) return null;

  const panelWidth = isMobile ? "100vw" : `${width}px`;

  return createPortal(
    <div
      aria-hidden={!open}
      className={`fixed inset-0 z-[60] ${open ? "pointer-events-auto" : "pointer-events-none"}`}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        style={{ width: panelWidth }}
        className={`absolute inset-y-0 right-0 flex flex-col bg-white shadow-xl transition-transform duration-200 ease-out dark:bg-[#111] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Resize-Handle (Desktop only) */}
        {!isMobile && (
          <div
            onPointerDown={startResize}
            onPointerMove={onResizeMove}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            className="group absolute inset-y-0 left-0 z-10 w-1.5 -translate-x-1/2 cursor-col-resize"
            title="Breite anpassen"
          >
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-200 transition group-hover:bg-primary dark:bg-[#2c2c2e]" />
          </div>
        )}

        {/* Header */}
        <header className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-[#2c2c2e]">
          <div className="min-w-0 flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">
            {title}
          </div>
          <div className="flex items-center gap-1">
            {headerExtras}
            <button
              onClick={onClose}
              title="Schliessen (ESC)"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}
