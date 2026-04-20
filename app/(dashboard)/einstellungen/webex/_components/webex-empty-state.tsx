"use client";

import { FileText, Mic, Phone, Sparkles } from "lucide-react";

export function WebexEmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-primary/5 via-white to-primary/10 p-8 dark:border-[#2c2c2e]/50 dark:from-primary/10 dark:via-[#1c1c1e] dark:to-primary/20">
      <div className="mx-auto max-w-xl text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white shadow-sm">
          <Sparkles className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-xl font-bold tracking-tight">
          Webex in 2 Minuten einrichten
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Damit Aufzeichnungen, Transkripte und Click-to-Call funktionieren, verbinde dein
          Webex-Konto. Der geführte Assistent erklärt jeden Schritt inklusive Screenshots, welche
          Haken du in <span className="font-mono text-[11px]">admin.webex.com</span> setzen musst
          und wie du den Token erzeugst.
        </p>
        <button
          onClick={onStart}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-dark hover:shadow"
        >
          Einrichtungs-Assistent starten
        </button>

        <ul className="mt-8 grid gap-3 text-left sm:grid-cols-3">
          <Feature icon={Mic} title="Aufzeichnungen" desc="Audio aller Gespräche automatisch im CRM." />
          <Feature icon={FileText} title="Transkripte" desc="Text-Mitschrift für Qualitätssicherung." />
          <Feature icon={Phone} title="Click-to-Call" desc="Leads direkt aus dem CRM anrufen." />
        </ul>
      </div>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  desc,
}: {
  icon: typeof Mic;
  title: string;
  desc: string;
}) {
  return (
    <li className="rounded-lg border border-gray-100 bg-white/70 p-3 backdrop-blur-sm dark:border-[#2c2c2e] dark:bg-[#1c1c1e]/50">
      <Icon className="h-4 w-4 text-primary" />
      <p className="mt-1.5 text-sm font-medium">{title}</p>
      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{desc}</p>
    </li>
  );
}
