"use client";

import { usePathname } from "next/navigation";
import { ServiceModeSwitch } from "../service-mode-switch";
import { ActiveEnrichmentBadge } from "../active-enrichment-badge";
import { GlobalSearch } from "../global-search";
import { TimerBar } from "../zeit/_components/timer-bar";

type Section = "vertrieb" | "fulfillment" | "zeit" | "admin" | "other";

function sectionFromPath(pathname: string): Section {
  if (pathname.startsWith("/zeit")) return "zeit";
  if (pathname.startsWith("/fulfillment")) return "fulfillment";
  // Admin-Kontext: alle administrativen Verwaltungsseiten landen hier, damit Sidebar/
  // Subtitle nicht "Vertrieb" anzeigen, wenn man auf /einstellungen/team o.ae. ist.
  if (pathname.startsWith("/admin") || pathname.startsWith("/einstellungen") || pathname.startsWith("/nutzer") || pathname.startsWith("/zeit/admin") || pathname === "/aktivitaet" || pathname === "/export") return "admin";
  // Vertrieb-Pfade: /, /leads, /import, /crm, /todos, /anrufe, /deals, /blacklist
  const vertriebPaths = ["/", "/leads", "/import", "/crm", "/todos", "/anrufe", "/deals", "/blacklist"];
  if (vertriebPaths.some((p) => p === "/" ? pathname === "/" : pathname.startsWith(p))) return "vertrieb";
  return "other";
}

interface Props {
  running: { id: string; started_at: string; note: string | null } | null;
}

export function HeaderBar({ running }: Props) {
  const pathname = usePathname();
  const section = sectionFromPath(pathname);

  const showServiceMode = section === "vertrieb";
  const showEnrichment = section === "vertrieb";
  const showSearch = section === "vertrieb" || section === "fulfillment";
  const showTimer = section === "zeit";

  return (
    <header className="flex items-center justify-between gap-4 border-b border-gray-200 px-8 py-3 dark:border-[#2c2c2e]/50">
      <div className="flex items-center gap-3">
        {showServiceMode && <ServiceModeSwitch />}
      </div>
      <div className="flex items-center gap-3">
        {showTimer && <TimerBar running={running} />}
        {showEnrichment && <ActiveEnrichmentBadge />}
        {showSearch && <GlobalSearch />}
      </div>
    </header>
  );
}
