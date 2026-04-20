import Link from "next/link";
import { SETTINGS_GROUPS } from "./_components/settings-groups";

export default function EinstellungenLandingPage() {
  return (
    <div>
      <header className="mb-8 border-b border-gray-200 pb-5 dark:border-[#2c2c2e]">
        <h1 className="text-2xl font-bold tracking-tight">Einstellungen</h1>
        <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
          Organisation, Qualifizierungs-Logik, Integrationen und Team-Verwaltung.
        </p>
      </header>

      <div className="space-y-8">
        {SETTINGS_GROUPS.map((group) => (
          <section key={group.label}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              {group.label}
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 transition hover:border-primary/50 hover:shadow-sm dark:border-[#2c2c2e] dark:bg-[#1c1c1e] dark:hover:border-primary/50"
                >
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition group-hover:bg-primary/20">
                    <item.icon className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium">{item.label}</p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {LINK_DESCRIPTIONS[item.href] ?? ""}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

const LINK_DESCRIPTIONS: Record<string, string> = {
  "/einstellungen/standort": "HQ-Adresse für Entfernungsberechnung",
  "/einstellungen/crm-status": "Vertriebsphasen für den CRM-Workflow",
  "/einstellungen/anreicherung": "Was beim Anreichern standardmäßig gesucht wird",
  "/einstellungen/pflichtfelder": "Welche Felder für Qualifizierung nötig sind",
  "/einstellungen/recruiting-bewertung": "Regeln für automatische Qualifizierung (Recruiting)",
  "/einstellungen/webdesign-bewertung": "Regeln für automatische Qualifizierung (Webdev)",
  "/einstellungen/phonemondo": "Click-to-Call-Integration + User-Durchwahlen",
  "/einstellungen/webex-recordings": "Automatischer Recording-Sync aus Webex",
  "/einstellungen/team": "Nutzerkonten & Rollen verwalten",
};
