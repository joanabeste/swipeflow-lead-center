// Shared Daten-Modul für die Einstellungs-Navigation.
//
// Achtung: Dieses Modul darf NICHT mit "use client" markiert sein.
// Sonst werden die Exporte zu Client-Reference-Stubs, und Server Components,
// die hier Werte importieren (z.B. app/(dashboard)/einstellungen/page.tsx),
// bekommen keinen echten Array zurück — `SETTINGS_GROUPS.map is not a function`.

import {
  MapPin, Tag, Sparkles, ListChecks, Briefcase, Globe, Phone, Mic, Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface SettingsNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface SettingsNavGroup {
  label: string;
  items: SettingsNavItem[];
}

export const SETTINGS_GROUPS: SettingsNavGroup[] = [
  {
    label: "Organisation",
    items: [
      { href: "/einstellungen/standort", label: "Standort", icon: MapPin },
      { href: "/einstellungen/crm-status", label: "CRM-Status", icon: Tag },
    ],
  },
  {
    label: "Qualifizierung",
    items: [
      { href: "/einstellungen/anreicherung", label: "Anreicherung", icon: Sparkles },
      { href: "/einstellungen/pflichtfelder", label: "Pflichtfelder", icon: ListChecks },
      { href: "/einstellungen/recruiting-bewertung", label: "Recruiting-Bewertung", icon: Briefcase },
      { href: "/einstellungen/webdesign-bewertung", label: "Webdesign-Bewertung", icon: Globe },
    ],
  },
  {
    label: "Integrationen",
    items: [
      { href: "/einstellungen/phonemondo", label: "PhoneMondo", icon: Phone },
      { href: "/einstellungen/webex", label: "Webex", icon: Mic },
    ],
  },
  {
    label: "Team",
    items: [
      { href: "/einstellungen/team", label: "Nutzer & Rollen", icon: Users },
    ],
  },
];

export const SETTINGS_ITEMS: SettingsNavItem[] = SETTINGS_GROUPS.flatMap((g) => g.items);

export function getSettingsMeta(pathname: string): { group: string; label: string } | null {
  for (const group of SETTINGS_GROUPS) {
    const hit = group.items.find((i) => i.href === pathname);
    if (hit) return { group: group.label, label: hit.label };
  }
  return null;
}
