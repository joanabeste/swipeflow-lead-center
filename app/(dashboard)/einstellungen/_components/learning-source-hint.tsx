import Link from "next/link";
import { ArrowRight, GraduationCap } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import type { LeadVertical } from "@/lib/types";

interface StatusRow {
  id: string;
  label: string;
  color: string;
  learning_signal: "positive" | "negative";
}

export async function LearningSourceHint({ vertical }: { vertical: LeadVertical }) {
  const db = createServiceClient();
  const { data } = await db
    .from("custom_lead_statuses")
    .select("id, label, color, learning_signal")
    .not("learning_signal", "is", null)
    .or(`vertical.is.null,vertical.eq.${vertical}`)
    .order("display_order", { ascending: true });

  const rows = (data ?? []) as StatusRow[];
  const positive = rows.filter((r) => r.learning_signal === "positive");
  const negative = rows.filter((r) => r.learning_signal === "negative");

  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300">
          <GraduationCap className="h-[18px] w-[18px]" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-medium">Womit lernt diese Bewertung?</p>
          <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
            Die KI vergleicht Leads in den folgenden Status, um Anpassungen
            vorzuschlagen. Status ohne Vertikale-Bindung gelten fuer beide Bewertungen.
          </p>

          {rows.length === 0 ? (
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Noch keine Status mit Trainingssignal markiert. Setze in den{" "}
              <Link href="/einstellungen/crm-status" className="underline">
                CRM-Status-Einstellungen
              </Link>{" "}
              ein Signal (&bdquo;Positiv&ldquo; / &bdquo;Negativ&ldquo;), damit die KI Stichproben sammeln kann.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {positive.length > 0 && (
                <SignalGroup title="Positive Stichproben (gute Leads)" rows={positive} tone="positive" />
              )}
              {negative.length > 0 && (
                <SignalGroup title="Negative Stichproben (schlechte Leads)" rows={negative} tone="negative" />
              )}
            </div>
          )}

          <Link
            href="/einstellungen/crm-status"
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Status verwalten
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function SignalGroup({
  title, rows, tone,
}: {
  title: string;
  rows: StatusRow[];
  tone: "positive" | "negative";
}) {
  const toneClasses =
    tone === "positive"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
      : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300";
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</p>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {rows.map((r) => (
          <li
            key={r.id}
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${toneClasses}`}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: r.color }}
            />
            {r.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
