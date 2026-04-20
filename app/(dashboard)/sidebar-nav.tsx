"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileSpreadsheet,
  Upload,
  PhoneCall,
  PhoneOutgoing,
  ShieldBan,
  Settings,
  ScrollText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const mainNav: NavItem[] = [
  { href: "/", label: "Übersicht", icon: LayoutDashboard },
  { href: "/leads", label: "Neue Leads", icon: FileSpreadsheet },
  { href: "/import", label: "Import", icon: Upload },
  { href: "/crm", label: "CRM", icon: PhoneCall },
  { href: "/anrufe", label: "Auto-Dialer", icon: PhoneOutgoing },
];

const settingsNav: NavItem[] = [
  { href: "/blacklist", label: "Ausschluss", icon: ShieldBan },
  { href: "/einstellungen", label: "Einstellungen", icon: Settings },
  { href: "/aktivitaet", label: "Aktivität", icon: ScrollText },
];

export function SidebarNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  function renderItem(item: NavItem) {
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
          active
            ? "bg-primary/10 text-primary"
            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
        }`}
      >
        <item.icon className="h-[18px] w-[18px]" />
        {item.label}
      </Link>
    );
  }

  return (
    <nav className="flex-1 px-3">
      <div className="space-y-1">
        {mainNav.map(renderItem)}
      </div>
      <p className="mb-2 mt-6 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-600">
        Verwaltung
      </p>
      <div className="space-y-1">
        {settingsNav.map(renderItem)}
      </div>
    </nav>
  );
}
