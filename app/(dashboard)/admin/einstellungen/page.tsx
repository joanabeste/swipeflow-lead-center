import Link from "next/link";
import { ExternalLink } from "lucide-react";

const SHORTCUTS: Array<{ href: string; label: string; desc: string }> = [
  { href: "/einstellungen/standort", label: "Standort", desc: "Geo-Konfiguration" },
  { href: "/einstellungen/crm-status", label: "CRM-Status", desc: "Workflow-Stati fuer Vertrieb" },
  { href: "/einstellungen/deal-stages", label: "Deal-Stages", desc: "Phasen-Pipeline" },
  { href: "/einstellungen/anreicherung", label: "Anreicherung", desc: "Enrichment-Pipeline" },
  { href: "/einstellungen/anrufe", label: "Anrufe", desc: "Auto-Dialer-Settings" },
  { href: "/einstellungen/phonemondo", label: "Phonemondo", desc: "Call-Provider-Integration" },
  { href: "/einstellungen/webex", label: "Webex", desc: "Call-Provider-Integration" },
  { href: "/einstellungen/email", label: "E-Mail", desc: "SMTP-Setup" },
  { href: "/einstellungen/email-vorlagen", label: "E-Mail-Vorlagen", desc: "Template-Bibliothek" },
  { href: "/einstellungen/landing-pages", label: "Landing-Pages", desc: "Personalisierte Landingpages" },
  { href: "/einstellungen/pflichtfelder", label: "Pflichtfelder", desc: "Required-Fields-Profile" },
  { href: "/einstellungen/scoring-vorschlaege", label: "Scoring-Vorschlaege", desc: "KI-Scoring-Review" },
  { href: "/einstellungen/recruiting-bewertung", label: "Recruiting-Bewertung", desc: "Scoring-Config Recruiting" },
  { href: "/einstellungen/webdesign-bewertung", label: "Webdesign-Bewertung", desc: "Scoring-Config Webdesign" },
  { href: "/einstellungen/provisionen", label: "Provisionen", desc: "Commission-Rules" },
  { href: "/einstellungen/papierkorb", label: "Papierkorb", desc: "Geloeschte Leads" },
];

export default function AdminEinstellungenPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Globale Einstellungen</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Alle App-weiten Konfigurationen an einem Ort. Modul-spezifische Settings (Zeit, Fulfillment) findest du in der jeweiligen Sektion.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
        <ul className="divide-y divide-gray-100 dark:divide-[#2c2c2e]/40">
          {SHORTCUTS.map((s) => (
            <li key={s.href}>
              <Link href={s.href} className="flex items-center gap-4 px-5 py-3 transition hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{s.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{s.desc}</p>
                </div>
                <ExternalLink className="h-4 w-4 text-gray-400" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
