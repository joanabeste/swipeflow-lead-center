"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

// Swipeflow-Palette: Primär-Gold-Töne + Emerald (Erfolg) + Weiß.
const COLORS = ["#d2a966", "#c49a55", "#e0b97c", "#10b981", "#ffffff"];
const PIECE_COUNT = 90;
const LIFETIME_MS = 4800;

interface Piece {
  id: number;
  left: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
  rotate: number;
  drift: number;
  shape: "square" | "circle" | "bar";
}

function makePieces(): Piece[] {
  return Array.from({ length: PIECE_COUNT }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    size: 6 + Math.random() * 8,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    delay: Math.random() * 350,
    duration: 2600 + Math.random() * 1800,
    rotate: (Math.random() - 0.5) * 1080,
    drift: (Math.random() - 0.5) * 200,
    shape: (["square", "circle", "bar"] as const)[Math.floor(Math.random() * 3)],
  }));
}

function ConfettiBurst() {
  const pieces = useMemo(() => makePieces(), []);
  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="animate-confetti-fall absolute -top-6"
          style={
            {
              left: `${p.left}%`,
              width: p.shape === "bar" ? p.size * 0.4 : p.size,
              height: p.shape === "bar" ? p.size * 1.6 : p.size,
              backgroundColor: p.color,
              borderRadius: p.shape === "circle" ? "9999px" : "2px",
              animationDelay: `${p.delay}ms`,
              animationDuration: `${p.duration}ms`,
              "--confetti-rotate": `${p.rotate}deg`,
              "--confetti-drift": `${p.drift}px`,
              boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

const ConfettiCtx = createContext<() => void>(() => {});

export function ConfettiProvider({ children }: { children: ReactNode }) {
  const [bursts, setBursts] = useState<number[]>([]);
  const fire = useCallback(() => {
    const id = Date.now() + Math.random();
    setBursts((b) => [...b, id]);
    setTimeout(() => setBursts((b) => b.filter((x) => x !== id)), LIFETIME_MS);
  }, []);
  return (
    <ConfettiCtx.Provider value={fire}>
      {children}
      {bursts.map((id) => (
        <ConfettiBurst key={id} />
      ))}
    </ConfettiCtx.Provider>
  );
}

export function useConfetti(): () => void {
  return useContext(ConfettiCtx);
}
