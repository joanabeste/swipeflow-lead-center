"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Brain, Check, X, RefreshCw, Sparkles } from "lucide-react";
import type { ScoringSuggestion } from "@/lib/types";
import {
  acceptScoringSuggestion,
  rejectScoringSuggestion,
  triggerScoringReview,
} from "../../actions";

const VERTICAL_LABEL: Record<string, string> = {
  webdesign: "Webdesign-Bewertung",
  recruiting: "Recruiting-Bewertung",
};

const FIELD_LABEL: Record<string, string> = {
  strictness: "Strenge",
  design_focus: "Design-Fokus",
  min_issues_to_qualify: "Min. Probleme zur Qualifizierung",
  slow_load_threshold_ms: "Langsam-Schwelle (ms)",
  very_slow_load_threshold_ms: "Sehr-langsam-Schwelle (ms)",
  check_ssl: "SSL pruefen",
  check_responsive: "Mobile pruefen",
  check_meta_tags: "Meta-Tags pruefen",
  check_alt_tags: "Alt-Tags pruefen",
  check_outdated_html: "Veraltetes HTML pruefen",
  allow_leads_without_website: "Leads ohne Website akzeptieren",
  min_job_postings_to_qualify: "Min. Stellen zur Qualifizierung",
  require_hr_contact: "HR-Kontakt erforderlich",
  require_contact_email: "Kontakt-E-Mail erforderlich",
};

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Ja" : "Nein";
  return String(v);
}

export function SuggestionList({
  pending,
  history,
}: {
  pending: ScoringSuggestion[];
  history: ScoringSuggestion[];
}) {
  const router = useRouter();
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const [reviewPending, startReviewTransition] = useTransition();

  function handleManualReview() {
    setReviewError(null);
    setReviewMessage(null);
    startReviewTransition(async () => {
      const res = await triggerScoringReview();
      if ("error" in res) {
        setReviewError(res.error);
      } else {
        setReviewMessage("Review abgeschlossen — siehe Ergebnisse unten.");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Manuelles Review starten</h2>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              Lauft regulaer Montag morgens automatisch. Hier kannst du eine sofortige
              Auswertung anstossen.
            </p>
          </div>
          <button
            onClick={handleManualReview}
            disabled={reviewPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-gray-900 hover:bg-primary-dark disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {reviewPending ? "Analysiere…" : "Jetzt analysieren"}
          </button>
        </div>
        {reviewError && <p className="mt-3 text-xs text-red-600">{reviewError}</p>}
        {reviewMessage && <p className="mt-3 text-xs text-emerald-600">{reviewMessage}</p>}
      </div>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Offene Vorschlaege
        </h3>
        {pending.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-500 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e] dark:text-gray-400">
            Keine offenen Vorschlaege. Die KI braucht Leads in CRM-Statussen, die als
            <em className="px-1">Trainingssignal: Positiv</em>
            markiert sind, plus aussortierte Leads als Negativsignal.
          </div>
        ) : (
          <ul className="space-y-4">
            {pending.map((s) => (
              <PendingCard key={s.id} suggestion={s} />
            ))}
          </ul>
        )}
      </section>

      {history.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Historie
          </h3>
          <ul className="space-y-2">
            {history.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-gray-200 bg-white px-4 py-3 text-sm dark:border-[#2c2c2e] dark:bg-[#1c1c1e]"
              >
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs dark:bg-white/5">
                  <Brain className="h-3 w-3" />
                  {VERTICAL_LABEL[s.vertical] ?? s.vertical}
                </span>
                <StatusBadge status={s.status} />
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {new Date(s.created_at).toLocaleString("de-DE")}
                </span>
                <span className="text-xs text-gray-400">
                  {s.positive_sample_count} positiv · {s.negative_sample_count} negativ
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PendingCard({ suggestion }: { suggestion: ScoringSuggestion }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, startTransition] = useTransition();

  const cur = suggestion.current_config as unknown as Record<string, unknown>;
  const next = suggestion.suggested_config as unknown as Record<string, unknown>;
  const allKeys = Array.from(new Set([...Object.keys(cur), ...Object.keys(next)]));
  const changedKeys = allKeys.filter((k) => formatValue(cur[k]) !== formatValue(next[k]));

  function handle(action: "accept" | "reject") {
    setError(null);
    startTransition(async () => {
      const res =
        action === "accept"
          ? await acceptScoringSuggestion(suggestion.id)
          : await rejectScoringSuggestion(suggestion.id);
      if ("error" in res && res.error) {
        setError(res.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <li className="rounded-2xl border border-primary/40 bg-primary/5 p-5 dark:bg-primary/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium dark:bg-[#1c1c1e]">
            <Brain className="h-3.5 w-3.5" />
            {VERTICAL_LABEL[suggestion.vertical] ?? suggestion.vertical}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {new Date(suggestion.created_at).toLocaleString("de-DE")} · Modell:{" "}
            {suggestion.llm_model}
          </span>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Stichprobe: {suggestion.positive_sample_count} positive ·{" "}
          {suggestion.negative_sample_count} negative
        </div>
      </div>

      <p className="mt-3 text-sm text-gray-700 dark:text-gray-200">{suggestion.reasoning}</p>

      {Array.isArray(suggestion.key_observations) && suggestion.key_observations.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-gray-600 dark:text-gray-300">
          {suggestion.key_observations.map((obs, i) => (
            <li key={i}>{obs}</li>
          ))}
        </ul>
      )}

      <div className="mt-4 overflow-x-auto rounded-md border border-gray-200 bg-white dark:border-[#2c2c2e] dark:bg-[#161618]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wider text-gray-500 dark:border-[#2c2c2e] dark:text-gray-400">
              <th className="px-3 py-2 font-medium">Feld</th>
              <th className="px-3 py-2 font-medium">Aktuell</th>
              <th className="px-3 py-2 font-medium">Vorgeschlagen</th>
            </tr>
          </thead>
          <tbody>
            {allKeys.map((key) => {
              const changed = changedKeys.includes(key);
              return (
                <tr
                  key={key}
                  className={
                    changed
                      ? "border-t border-gray-200 bg-amber-50/60 dark:border-[#2c2c2e] dark:bg-amber-900/10"
                      : "border-t border-gray-200 dark:border-[#2c2c2e]"
                  }
                >
                  <td className="px-3 py-2 font-medium">{FIELD_LABEL[key] ?? key}</td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                    {formatValue(cur[key])}
                  </td>
                  <td
                    className={
                      changed ? "px-3 py-2 font-semibold text-amber-700 dark:text-amber-300" : "px-3 py-2"
                    }
                  >
                    {formatValue(next[key])}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {changedKeys.length === 0 && (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Die KI schlaegt keine Aenderungen vor — die aktuelle Konfiguration passt zu den Daten.
        </p>
      )}

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={() => handle("reject")}
          disabled={pendingAction}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-[#2c2c2e] dark:hover:bg-white/5"
        >
          <X className="h-3.5 w-3.5" />
          Ablehnen
        </button>
        <button
          onClick={() => handle("accept")}
          disabled={pendingAction || changedKeys.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-gray-900 hover:bg-primary-dark disabled:opacity-50"
        >
          {pendingAction ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Uebernehmen
        </button>
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: ScoringSuggestion["status"] }) {
  const styles: Record<ScoringSuggestion["status"], string> = {
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    accepted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    superseded: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400",
  };
  const label: Record<ScoringSuggestion["status"], string> = {
    pending: "Offen",
    accepted: "Uebernommen",
    rejected: "Abgelehnt",
    superseded: "Ueberholt",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {label[status]}
    </span>
  );
}
