"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Upload,
  Inbox,
  Users,
  PhoneOutgoing,
  Banknote,
  ShieldBan,
  Settings,
  ListTodo,
  Briefcase,
  Clock,
  ChevronDown,
  CheckSquare,
  Lock,
  Calendar,
  Pause,
  BarChart3,
  UserCog,
  Coins,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { UserRole } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badgeKey?: "todos_due_today_or_overdue" | "absences_pending";
}

interface NavGroup {
  label?: string;
  /** Wenn gesetzt: Gruppe nur fuer diese Rollen sichtbar. */
  rolesAllowed?: UserRole[];
  items: NavItem[];
}

type SectionId = "vertrieb" | "fulfillment" | "zeit";

interface Section {
  id: SectionId;
  label: string;
  icon: LucideIcon;
  groups: NavGroup[];
  comingSoon?: boolean;
  /** Welche Rollen die Sektion ueberhaupt sehen. */
  rolesAllowed: UserRole[];
}

const ROLES_BUSINESS: UserRole[] = ["admin", "sales", "viewer"];
const ROLES_ALL: UserRole[] = ["admin", "sales", "viewer", "employee"];
const ROLES_ADMIN: UserRole[] = ["admin"];

const vertriebSection: Section = {
  id: "vertrieb",
  label: "Vertrieb",
  icon: Users,
  rolesAllowed: ROLES_BUSINESS,
  groups: [
    { items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }] },
    { label: "Leads", items: [
      { href: "/import", label: "Import", icon: Upload },
      { href: "/leads", label: "Neue Leads", icon: Inbox },
    ]},
    { label: "Vertrieb", items: [
      { href: "/crm", label: "CRM", icon: Users },
      { href: "/todos", label: "ToDos", icon: ListTodo, badgeKey: "todos_due_today_or_overdue" },
      { href: "/anrufe", label: "Auto-Dialer", icon: PhoneOutgoing },
      { href: "/deals", label: "Deals", icon: Banknote },
    ]},
    { label: "Verwaltung", items: [
      { href: "/blacklist", label: "Ausschluss", icon: ShieldBan },
      { href: "/einstellungen", label: "Einstellungen", icon: Settings },
    ]},
  ],
};

const fulfillmentSection: Section = {
  id: "fulfillment",
  label: "Fulfillment",
  icon: Briefcase,
  rolesAllowed: ROLES_BUSINESS,
  groups: [
    { items: [
      { href: "/fulfillment/kunden", label: "Kunden", icon: Users },
      { href: "/fulfillment/projekte", label: "Projekte", icon: Briefcase },
      { href: "/fulfillment/tasks", label: "ClickUp-Tasks", icon: CheckSquare },
    ]},
    { label: "Admin", rolesAllowed: ROLES_ADMIN, items: [
      { href: "/fulfillment/einstellungen", label: "Einstellungen", icon: Settings },
    ]},
  ],
};

const zeitSection: Section = {
  id: "zeit",
  label: "Zeit",
  icon: Clock,
  rolesAllowed: ROLES_ALL,
  groups: [
    { items: [
      { href: "/zeit", label: "Timer", icon: Clock },
      { href: "/zeit/eintraege", label: "Eintraege", icon: ListTodo },
      { href: "/zeit/kalender", label: "Kalender", icon: Calendar },
      { href: "/zeit/abwesenheiten", label: "Abwesenheiten", icon: Pause },
      { href: "/zeit/reports", label: "Reports", icon: BarChart3 },
      { href: "/zeit/provision", label: "Provision", icon: Coins },
      { href: "/zeit/einstellungen", label: "Einstellungen", icon: Settings },
    ]},
    { label: "Admin", rolesAllowed: ROLES_ADMIN, items: [
      { href: "/zeit/admin/mitarbeiter", label: "Mitarbeiter", icon: UserCog },
      { href: "/zeit/admin/abwesenheiten", label: "Antraege", icon: Pause, badgeKey: "absences_pending" },
      { href: "/zeit/admin/reports", label: "Gesamt-Reports", icon: BarChart3 },
    ]},
  ],
};

const sections: Section[] = [vertriebSection, fulfillmentSection, zeitSection];

const SECTION_STORAGE_KEY = "lead-center:active-section";

export interface SidebarBadges {
  todos_due_today_or_overdue?: number;
  absences_pending?: number;
}

export function SidebarNav({ badges, role }: { badges?: SidebarBadges; role?: UserRole }) {
  const pathname = usePathname();
  const visibleSections = sections.filter((s) => !role || s.rolesAllowed.includes(role));
  const fallbackSection: SectionId = visibleSections[0]?.id ?? "vertrieb";

  const [activeSection, setActiveSection] = useState<SectionId>(fallbackSection);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  useEffect(() => {
    const fromPath = visibleSections.find((s) =>
      s.groups.some((g) =>
        g.items.some((i) => i.href !== "#" && (i.href === "/" ? pathname === "/" : pathname.startsWith(i.href))),
      ),
    );
    if (fromPath) {
      setActiveSection(fromPath.id);
      return;
    }
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(SECTION_STORAGE_KEY) : null;
    if (stored && visibleSections.some((s) => s.id === stored)) {
      setActiveSection(stored as SectionId);
    } else {
      setActiveSection(fallbackSection);
    }
  }, [pathname, role]);

  function selectSection(id: SectionId) {
    setActiveSection(id);
    setSwitcherOpen(false);
    if (typeof window !== "undefined") window.localStorage.setItem(SECTION_STORAGE_KEY, id);
  }

  const current = visibleSections.find((s) => s.id === activeSection) ?? visibleSections[0] ?? vertriebSection;

  function isActive(href: string) {
    if (href === "#") return false;
    if (href === "/") return pathname === "/";
    // Exakter Match fuer /zeit damit /zeit/eintraege nicht beide markiert.
    if (href === "/zeit") return pathname === "/zeit";
    return pathname.startsWith(href);
  }

  function renderItem(item: NavItem, disabled: boolean) {
    const active = !disabled && isActive(item.href);
    const badgeValue = item.badgeKey ? badges?.[item.badgeKey] ?? 0 : 0;
    const className = `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
      disabled
        ? "cursor-not-allowed text-gray-400 dark:text-gray-600"
        : active
          ? "bg-primary/10 text-primary"
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
    }`;

    if (disabled) {
      return (
        <div key={`${item.label}-disabled`} className={className} aria-disabled="true" title="Bald verfuegbar">
          <item.icon className="h-[18px] w-[18px]" />
          <span className="flex-1">{item.label}</span>
          <Lock className="h-3.5 w-3.5 opacity-60" />
        </div>
      );
    }

    return (
      <Link key={item.href} href={item.href} className={className}>
        <item.icon className="h-[18px] w-[18px]" />
        <span className="flex-1">{item.label}</span>
        {badgeValue > 0 && (
          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">
            {badgeValue > 99 ? "99+" : badgeValue}
          </span>
        )}
      </Link>
    );
  }

  return (
    <nav className="flex-1 px-3">
      <SectionSwitcher
        current={current}
        sections={visibleSections}
        open={switcherOpen}
        onToggle={() => setSwitcherOpen((v) => !v)}
        onSelect={selectSection}
      />

      {current.groups
        .filter((g) => !g.rolesAllowed || (role && g.rolesAllowed.includes(role)))
        .map((group, idx) => (
          <div key={`${current.id}-${idx}`}>
            {group.label && <SectionLabel>{group.label}</SectionLabel>}
            <div className={`space-y-1 ${!group.label && idx === 0 ? "mt-3" : ""}`}>
              {group.items.map((item) => renderItem(item, current.comingSoon === true))}
            </div>
          </div>
        ))}

      {current.comingSoon && (
        <p className="mt-6 px-3 text-[11px] text-gray-400 dark:text-gray-600">
          Diese Sektion ist in Vorbereitung — Routen werden in einer spaeteren Phase aktiviert.
        </p>
      )}
    </nav>
  );
}

function SectionSwitcher({
  current,
  sections,
  open,
  onToggle,
  onSelect,
}: {
  current: Section;
  sections: Section[];
  open: boolean;
  onToggle: () => void;
  onSelect: (id: SectionId) => void;
}) {
  return (
    <div className="relative mb-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-900 transition hover:bg-gray-100 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e] dark:text-gray-100 dark:hover:bg-[#222224]"
      >
        <current.icon className="h-[18px] w-[18px]" />
        <span className="flex-1 text-left">{current.label}</span>
        <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
          {sections.map((s) => {
            const isCurrent = s.id === current.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect(s.id)}
                className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition ${
                  isCurrent
                    ? "bg-primary/10 text-primary"
                    : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
                }`}
              >
                <s.icon className="h-[18px] w-[18px]" />
                <span className="flex-1 text-left">{s.label}</span>
                {s.comingSoon && (
                  <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-600 dark:bg-[#2c2c2e] dark:text-gray-400">
                    Bald
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 mt-6 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-600">
      {children}
    </p>
  );
}
