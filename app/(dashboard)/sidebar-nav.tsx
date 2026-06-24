"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  Calendar,
  Pause,
  BarChart3,
  UserCog,
  Coins,
  Sliders,
  Archive,
  Activity as ActivityIcon,
  Download,
  GraduationCap,
  BookOpen,
  TrendingUp,
  Pencil,
  FileSignature,
  FilePlus,
  UserPlus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SectionPermissions, UserRole } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badgeKey?: "todos_due_today_or_overdue" | "absences_pending";
}

interface NavGroup {
  label?: string;
  rolesAllowed?: UserRole[];
  /** Wenn true: nur sichtbar, wenn der User Learning-Editor ist. */
  learningEditorOnly?: boolean;
  items: NavItem[];
}

type SectionId = "vertrieb" | "fulfillment" | "zeit" | "learning" | "vertraege" | "admin";

interface Section {
  id: SectionId;
  label: string;
  icon: LucideIcon;
  /** Erste Route der Sektion — Switcher springt dorthin. */
  defaultPath: string;
  /** Pflicht-Permission. "admin" = nur Admins. */
  requires: keyof SectionPermissions | "admin";
  groups: NavGroup[];
}

const ROLES_ADMIN: UserRole[] = ["admin"];

const vertriebSection: Section = {
  id: "vertrieb",
  label: "Vertrieb",
  icon: Users,
  defaultPath: "/",
  requires: "can_vertrieb",
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
    ]},
  ],
};

const fulfillmentSection: Section = {
  id: "fulfillment",
  label: "Fulfillment",
  icon: Briefcase,
  defaultPath: "/fulfillment/kunden",
  requires: "can_fulfillment",
  groups: [
    { items: [
      { href: "/fulfillment/kunden", label: "Kunden", icon: Users },
      { href: "/fulfillment/projekte", label: "Projekte", icon: Briefcase },
      { href: "/fulfillment/inbox", label: "Mail-Inbox", icon: Inbox },
      { href: "/fulfillment/tasks", label: "ClickUp-Tasks", icon: CheckSquare },
    ]},
    { label: "Admin", rolesAllowed: ROLES_ADMIN, items: [
      { href: "/fulfillment/einstellungen", label: "Einstellungen", icon: Settings },
    ]},
  ],
};

const zeitSection: Section = {
  id: "zeit",
  label: "Zeit & Lohn",
  icon: Clock,
  defaultPath: "/zeit",
  requires: "can_zeit",
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
    // Admin-Funktionen fuer Zeit & Lohn (Mitarbeiter-Verwaltung, Abwesenheits-Antraege,
    // Gesamt-Reports) leben jetzt in der Admin-Sektion (Gruppe "Zeit & Lohn-Admin").
  ],
};

const learningSection: Section = {
  id: "learning",
  label: "Learning",
  icon: GraduationCap,
  defaultPath: "/learning",
  requires: "can_learning",
  groups: [
    { items: [
      { href: "/learning", label: "Kurse", icon: BookOpen },
      { href: "/learning/mein-fortschritt", label: "Mein Fortschritt", icon: TrendingUp },
    ]},
    { label: "Verwalten", learningEditorOnly: true, items: [
      { href: "/learning/admin", label: "Kurse verwalten", icon: Pencil },
      { href: "/learning/admin/kategorien", label: "Kategorien", icon: Sliders },
    ]},
  ],
};

const vertraegeSection: Section = {
  id: "vertraege",
  label: "Verträge",
  icon: FileSignature,
  defaultPath: "/vertraege",
  requires: "can_vertraege",
  groups: [
    { label: "Kundenverträge", items: [
      { href: "/vertraege", label: "Uebersicht", icon: FileSignature },
      { href: "/vertraege/neu", label: "Neuer Vertrag", icon: FilePlus },
    ]},
    { label: "Personal", items: [
      { href: "/vertraege/arbeit", label: "Arbeitsverträge", icon: Briefcase },
      { href: "/vertraege/arbeit/neu", label: "Neuer Arbeitsvertrag", icon: UserPlus },
    ]},
    { items: [
      { href: "/vertraege/einstellungen", label: "Einstellungen", icon: Settings },
    ]},
  ],
};

const adminSection: Section = {
  id: "admin",
  label: "Admin",
  icon: Sliders,
  defaultPath: "/admin",
  requires: "admin",
  groups: [
    { items: [
      { href: "/admin", label: "Uebersicht", icon: LayoutDashboard },
      { href: "/admin/team", label: "Team & Nutzer", icon: Users },
      { href: "/admin/provisionen", label: "Provisionen & Loehne", icon: Coins },
      { href: "/admin/einstellungen", label: "Globale Einstellungen", icon: Sliders },
      { href: "/admin/einstellungen/integrationen", label: "Integrationen", icon: CheckSquare },
    ]},
    { label: "Zeit & Lohn-Admin", items: [
      { href: "/zeit/admin/mitarbeiter", label: "Mitarbeiter", icon: UserCog },
      { href: "/zeit/admin/abwesenheiten", label: "Abwesenheits-Antraege", icon: Pause, badgeKey: "absences_pending" },
      { href: "/zeit/admin/reports", label: "Stunden-Reports", icon: BarChart3 },
    ]},
    { label: "System", items: [
      { href: "/aktivitaet", label: "Audit-Log", icon: ActivityIcon },
      { href: "/export", label: "Export", icon: Download },
      { href: "/einstellungen/aussortierte-leads", label: "Aussortierte Leads", icon: Archive },
    ]},
  ],
};

const ALL_SECTIONS: Section[] = [vertriebSection, fulfillmentSection, learningSection, zeitSection, vertraegeSection, adminSection];

const SECTION_STORAGE_KEY = "lead-center:active-section";

export interface SidebarBadges {
  todos_due_today_or_overdue?: number;
  absences_pending?: number;
}

function hasAccess(section: Section, role: UserRole | undefined, permissions: SectionPermissions | undefined): boolean {
  if (!role) return false;
  if (role === "admin") return true; // Admins sehen alles
  if (section.requires === "admin") return false;
  return permissions?.[section.requires] === true;
}

export function SidebarNav({
  badges,
  role,
  permissions,
  learningEditor,
}: {
  badges?: SidebarBadges;
  role?: UserRole;
  permissions?: SectionPermissions;
  learningEditor?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const visibleSections = ALL_SECTIONS.filter((s) => hasAccess(s, role, permissions));
  const fallbackSection: SectionId = visibleSections[0]?.id ?? "vertrieb";

  const [activeSection, setActiveSection] = useState<SectionId>(fallbackSection);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  useEffect(() => {
    // Admin-Kontext erzwingen fuer Verwaltungs-Routen, die nicht direkt in der Nav stehen
    // (z.B. /einstellungen/standort, /einstellungen/anreicherung, etc.). So bleibt der
    // Switcher auf Admin, wenn der User in einem Sub-Setting ist.
    const adminContext =
      pathname.startsWith("/admin") ||
      pathname.startsWith("/einstellungen") ||
      pathname.startsWith("/nutzer") ||
      pathname.startsWith("/zeit/admin") ||
      pathname === "/aktivitaet" ||
      pathname === "/export";
    if (adminContext && visibleSections.some((s) => s.id === "admin")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveSection("admin");
      return;
    }
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
  }, [pathname, role, permissions]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectSection(id: SectionId) {
    const target = visibleSections.find((s) => s.id === id);
    if (!target) return;
    setActiveSection(id);
    setSwitcherOpen(false);
    if (typeof window !== "undefined") window.localStorage.setItem(SECTION_STORAGE_KEY, id);
    router.push(target.defaultPath);
  }

  const current = visibleSections.find((s) => s.id === activeSection) ?? visibleSections[0];

  function isActive(href: string) {
    if (href === "#") return false;
    if (href === "/") return pathname === "/";
    if (href === "/zeit") return pathname === "/zeit";
    if (href === "/admin") return pathname === "/admin";
    if (href === "/vertraege") return pathname === "/vertraege";
    return pathname.startsWith(href);
  }

  function renderItem(item: NavItem) {
    const active = isActive(item.href);
    const badgeValue = item.badgeKey ? badges?.[item.badgeKey] ?? 0 : 0;
    const className = `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
      active
        ? "bg-primary/10 text-primary"
        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
    }`;
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

  if (!current) {
    return (
      <nav className="flex-1 px-3 py-4">
        <p className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400 dark:border-[#2c2c2e]/60">
          Keine Bereiche freigegeben. Bitte Admin kontaktieren.
        </p>
      </nav>
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
        .filter((g) => !g.learningEditorOnly || learningEditor === true)
        .map((group, idx) => (
          <div key={`${current.id}-${idx}`}>
            {group.label && <SectionLabel>{group.label}</SectionLabel>}
            <div className={`space-y-1 ${!group.label && idx === 0 ? "mt-3" : ""}`}>
              {group.items.map((item) => renderItem(item))}
            </div>
          </div>
        ))}
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
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl ring-1 ring-black/5 dark:border-[#3a3a3c] dark:bg-[#232325] dark:ring-white/10">
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
