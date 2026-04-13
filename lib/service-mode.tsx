"use client";

import { createContext, useContext, useState, useCallback } from "react";
import type { ServiceMode } from "@/lib/types";

const ServiceModeContext = createContext<{
  mode: ServiceMode;
  setMode: (mode: ServiceMode) => void;
}>({ mode: "recruiting", setMode: () => {} });

export function useServiceMode() {
  return useContext(ServiceModeContext);
}

export function ServiceModeProvider({
  initialMode,
  children,
}: {
  initialMode: ServiceMode;
  children: React.ReactNode;
}) {
  const [mode, setModeState] = useState<ServiceMode>(initialMode);

  const setMode = useCallback(async (newMode: ServiceMode) => {
    setModeState(newMode);
    // Server-Side speichern
    await fetch("/api/service-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: newMode }),
    });
    // Seite neu laden um Server-Daten zu aktualisieren
    window.location.reload();
  }, []);

  return (
    <ServiceModeContext value={{ mode, setMode }}>
      {children}
    </ServiceModeContext>
  );
}
