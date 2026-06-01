// Shared Daten-Modul für die Einstellungs-Navigation.
//
// Achtung: Dieses Modul darf NICHT mit "use client" markiert sein.
// Sonst werden die Exporte zu Client-Reference-Stubs, und Server Components,
// die hier Werte importieren (z.B. app/(dashboard)/einstellungen/page.tsx),
// bekommen keinen echten Array zurück — `SETTINGS_GROUPS.map is not a function`.

import {
  MapPin, Tag, Sparkles, ListChecks, Briefcase, Globe, Phone, Mic, Users, PhoneOutgoing, Banknote, Trash2, Megaphone, Brain, Archive, Coins,
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
      { href: "/einstellungen/deal-stages", label: "Deal-Stages", icon: Banknote },
      { href: "/einstellungen/projekt-typen", label: "Projekt-Typen", icon: Briefcase },
    ],
  },
  {
    label: "Qualifizierung",
    items: [
      { href: "/einstellungen/anreicherung", label: "Anreicherung", icon: Sparkles },
      { href: "/einstellungen/pflichtfelder", label: "Pflichtfelder", icon: ListChecks },
      { href: "/einstellungen/recruiting-bewertung", label: "Recruiting-Bewertung", icon: Briefcase },
      { href: "/einstellungen/webdesign-bewertung", label: "Webdesign-Bewertung", icon: Globe },
      { href: "/einstellungen/scoring-vorschlaege", label: "KI-Scoring-Vorschlaege", icon: Brain },
    ],
  },
  {
    label: "Integrationen",
    items: [
      { href: "/einstellungen/phonemondo", label: "PhoneMondo", icon: Phone },
      { href: "/einstellungen/webex", label: "Webex", icon: Mic },
      { href: "/einstellungen/anrufe", label: "Auto-Dialer", icon: PhoneOutgoing },
    ],
  },
  {
    label: "Marketing",
    items: [
      { href: "/einstellungen/landing-pages", label: "Landing Pages", icon: Megaphone },
    ],
  },
  {
    label: "Team",
    items: [
      { href: "/einstellungen/team", label: "Nutzer & Rollen", icon: Users },
      { href: "/einstellungen/provisionen", label: "Provisionen & Lohn", icon: Coins },
    ],
  },
  {
    label: "Verwaltung",
    items: [
      { href: "/einstellungen/papierkorb", label: "Papierkorb", icon: Trash2 },
      { href: "/einstellungen/aussortierte-leads", label: "Aussortierte Leads", icon: Archive },
    ],
  },
];

