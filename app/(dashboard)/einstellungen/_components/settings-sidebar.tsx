"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  MapPin, Tag, Sparkles, ListChecks, Briefcase, Globe, Phone, Mic, Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

export const SETTINGS_GROUPS: NavGroup[] = [
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
      { href: "/einstellungen/webex-recordings", label: "Aufzeichnungen", icon: Mic },
    ],
  },
  {
    label: "Team",
    items: [
      { href: "/einstellungen/team", label: "Nutzer & Rollen", icon: Users },
    ],
  },
];

const ALL_ITEMS: NavItem[] = SETTINGS_GROUPS.flatMap((g) => g.items);

export function SettingsSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <>
      {/* Mobile: Dropdown */}
      <div className="mb-6 lg:hidden">
        <label htmlFor="settings-mobile-nav" className="sr-only">Einstellung wählen</label>
        <select
          id="settings-mobile-nav"
          value={pathname}
          onChange={(e) => router.push(e.target.value)}
          className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
        >
          <option value="/einstellungen">Übersicht</option>
          {SETTINGS_GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.items.map((item) => (
                <option key={item.href} value={item.href}>{item.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Desktop: Sticky Sidebar */}
      <aside className="hidden lg:block">
        <nav className="sticky top-4 space-y-5">
          <Link
            href="/einstellungen"
            className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
              pathname === "/einstellungen"
                ? "bg-primary/10 text-primary"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
            }`}
          >
            Übersicht
          </Link>

          {SETTINGS_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-600">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                        active
                          ? "bg-primary/10 font-medium text-primary"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
                      }`}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}

export function getSettingsMeta(pathname: string): { group: string; label: string } | null {
  for (const group of SETTINGS_GROUPS) {
    const hit = group.items.find((i) => i.href === pathname);
    if (hit) return { group: group.label, label: hit.label };
  }
  return null;
}

export { ALL_ITEMS as SETTINGS_ITEMS };
