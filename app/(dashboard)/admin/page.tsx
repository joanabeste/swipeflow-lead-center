import Link from "next/link";
import { Users, UserCog, Sliders, Activity, Download, Archive, Coins } from "lucide-react";

const TILES = [
  { href: "/admin/team", label: "Team-Uebersicht", desc: "Alle Mitarbeiter mit Stunden, Provisionen, Auszahlung", icon: Users },
  { href: "/einstellungen/team", label: "Nutzer & Rollen", desc: "User anlegen, Rollen + Sektion-Berechtigungen", icon: UserCog },
  { href: "/einstellungen/provisionen", label: "Provisionen & Loehne", desc: "Provisions-Regeln und Stundenloehne pflegen", icon: Coins },
  { href: "/admin/einstellungen", label: "Globale Einstellungen", desc: "App-weite Konfiguration", icon: Sliders },
  { href: "/aktivitaet", label: "Aktivitaet", desc: "Audit-Log aller wichtigen Aktionen", icon: Activity },
  { href: "/export", label: "Export", desc: "Daten-Export (CSV)", icon: Download },
  { href: "/einstellungen/aussortierte-leads", label: "Aussortierte Leads", desc: "Archivierte Leads ansehen / wiederherstellen", icon: Archive },
];

export default function AdminUebersichtPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Admin</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Verwaltung, Berechtigungen und globale Einstellungen</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TILES.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="group rounded-2xl border border-gray-200 bg-white p-5 transition hover:border-primary/40 hover:shadow-sm dark:border-[#2c2c2e]/50 dark:bg-[#161618] dark:hover:border-primary/40"
          >
            <t.icon className="h-6 w-6 text-primary" />
            <h3 className="mt-3 text-base font-semibold text-gray-900 dark:text-white">{t.label}</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
