"use client";

import { useEffect, useState } from "react";

function greetingFor(hour: number): string {
  if (hour < 5) return "Nacht-Schicht";
  if (hour < 11) return "Guten Morgen";
  if (hour < 14) return "Moin";
  if (hour < 18) return "Guten Tag";
  return "Guten Abend";
}

export function Greeting({ displayName }: { displayName: string }) {
  // Lokal beim User (Browser-Uhr) berechnen — sonst friert SSR die Tageszeit ein.
  // Initial "Hallo" rendern, damit SSR/CSR-Markup identisch ist (keine Hydration-
  // Warnung), direkt danach per Effect auf die tatsächliche Tageszeit updaten.
  const [greeting, setGreeting] = useState("Hallo");

  useEffect(() => {
    const update = () => setGreeting(greetingFor(new Date().getHours()));
    update();
    // Alle 5 min neu prüfen, damit die Anzeige "mitläuft", wenn der Tab offen bleibt.
    const interval = window.setInterval(update, 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <h1 className="text-2xl font-bold tracking-tight">
      {greeting}
      {displayName ? `, ${displayName}` : ""} 👋
    </h1>
  );
}
