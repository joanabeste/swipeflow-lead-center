import Link from "next/link";
import { MapPin, Tag, Banknote, Sparkles, ListChecks, Brain, Phone, Video, Mail, FileText, Globe, ShieldBan, Archive, Trash2, Plug, Building2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth";

interface SettingItem {
  href: string;
  label: string;
  desc: string;
  icon: typeof MapPin;
}

interface SettingGroup {
  id: string;
  label: string;
  icon: typeof MapPin;
  items: SettingItem[];
}

const GROUPS: SettingGroup[] = [
  {
    id: "organisation",
    label: "Organisation",
    icon: Building2,
    items: [
      { href: "/einstellungen/standort", label: "Standort", desc: "HQ-Adresse, Geo-Daten", icon: MapPin },
      { href: "/einstellungen/crm-status", label: "CRM-Status", desc: "Workflow-Stati pro Bereich", icon: Tag },
      { href: "/einstellungen/deal-stages", label: "Deal-Stages", desc: "Pipeline-Phasen", icon: Banknote },
    ],
  },
  {
    id: "integrationen",
    label: "Integrationen",
    icon: Plug,
    items: [
      { href: "/admin/einstellungen/integrationen", label: "Uebersicht", desc: "Status & Schnellzugriff aller Verbindungen", icon: Plug },
      { href: "/fulfillment/einstellungen", label: "ClickUp", desc: "Task-Sync fuer Fulfillment", icon: ListChecks },
      { href: "/einstellungen/phonemondo", label: "PhoneMondo", desc: "Auto-Dialer + Call-Provider", icon: Phone },
      { href: "/einstellungen/webex", label: "Webex", desc: "Call-Recording", icon: Video },
      { href: "/einstellungen/email", label: "E-Mail (SMTP)", desc: "SMTP-Settings", icon: Mail },
      { href: "/einstellungen/email-vorlagen", label: "E-Mail-Vorlagen", desc: "Templates fuer Mail-Versand", icon: FileText },
    ],
  },
  {
    id: "qualifizierung",
    label: "Lead-Qualifizierung",
    icon: Brain,
    items: [
      { href: "/einstellungen/anreicherung", label: "Anreicherung", desc: "Enrichment-Pipeline", icon: Sparkles },
      { href: "/einstellungen/pflichtfelder", label: "Pflichtfelder", desc: "Required-Field-Profile", icon: ListChecks },
      { href: "/einstellungen/recruiting-bewertung", label: "Recruiting-Bewertung", desc: "Scoring-Config Recruiting", icon: Brain },
      { href: "/einstellungen/webdesign-bewertung", label: "Webdesign-Bewertung", desc: "Scoring-Config Webdesign", icon: Brain },
      { href: "/einstellungen/scoring-vorschlaege", label: "Scoring-Vorschlaege", desc: "KI-Review von Lead-Scores", icon: Brain },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    icon: Globe,
    items: [
      { href: "/einstellungen/landing-pages", label: "Landing-Pages", desc: "Personalisierte LPs pro Bereich", icon: Globe },
    ],
  },
  {
    id: "verwaltung",
    label: "Daten-Verwaltung",
    icon: Archive,
    items: [
      { href: "/einstellungen/aussortierte-leads", label: "Aussortierte Leads", desc: "Archivierte Leads wiederherstellen", icon: Archive },
      { href: "/blacklist", label: "Ausschluss-Liste", desc: "Blacklist + Cancel-Regeln", icon: ShieldBan },
      { href: "/einstellungen/papierkorb", label: "Papierkorb", desc: "Geloeschte Leads", icon: Trash2 },
    ],
  },
  {
    id: "anrufe",
    label: "Anrufe & Auto-Dialer",
    icon: Phone,
    items: [
      { href: "/einstellungen/anrufe", label: "Auto-Dialer", desc: "Dialer-Settings", icon: Phone },
    ],
  },
];

export default async function AdminEinstellungenPage() {
  await requireAdmin();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Globale Einstellungen</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Alle App-weiten Konfigurationen, gruppiert nach Bereich. Modul-spezifische User-Settings
          (z.B. Pausen-Modus in Zeit & Gehalt) findest du in der jeweiligen Sektion.
        </p>
      </div>

      {GROUPS.map((g) => (
        <section key={g.id}>
          <div className="mb-3 flex items-center gap-2">
            <g.icon className="h-4 w-4 text-gray-400" />
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">{g.label}</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className="group rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-primary/40 hover:shadow-sm dark:border-[#2c2c2e]/50 dark:bg-[#161618] dark:hover:border-primary/40"
              >
                <it.icon className="h-5 w-5 text-primary" />
                <h3 className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">{it.label}</h3>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{it.desc}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
