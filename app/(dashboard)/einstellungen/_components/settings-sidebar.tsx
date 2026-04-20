"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SETTINGS_GROUPS } from "./settings-groups";

// Re-Export für Bestands-Konsumenten (die vorher aus dem Client-Modul importiert haben).
export { SETTINGS_GROUPS, SETTINGS_ITEMS, getSettingsMeta } from "./settings-groups";
export type { SettingsNavItem, SettingsNavGroup } from "./settings-groups";

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
