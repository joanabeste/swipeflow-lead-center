/**
 * Override-basierter Scoring-Reviewer.
 *
 * Liest cancel_override_log: alle Leads, die manuell aus cancelled/filtered
 * zurueck in die Pipeline gezogen wurden. Das ist das staerkste passive
 * Lernsignal — der User hat dem System aktiv widersprochen.
 *
 * Pro reason_code (z.B. "no_jobs", "no_hr_contact", "size_mismatch") werden:
 *  1. Override-Rate ermittelt: wie viele Cancels mit diesem Code wurden ueberschrieben?
 *  2. Faktor-Verteilung der ueberschriebenen Leads gezogen (aus factor_snapshot).
 *  3. Sample-Lead-IDs gesammelt fuers UI-Springen.
 *
 * Ergebnis: scoring_suggestion mit trigger_source='override_rate'. Anders als
 * der CRM-Status-Reviewer schlaegt dieser keine Config-Aenderung vor, sondern
 * beschreibt das Override-Muster — ein Admin entscheidet, ob die Cancel-Rule
 * geloescht/entschaerft oder die Scoring-Konfig angepasst wird.
 *
 * MIN_OVERRIDES bewusst niedrig: schon wenige Overrides pro Code reichen, um
 * ein Muster sichtbar zu machen. Lieber fruh Warnsignal als zu spaet lernen.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import {
  DEFAULT_RECRUITING_SCORING,
  DEFAULT_WEBDEV_SCORING,
  type LeadVertical,
} from "@/lib/types";

const MIN_OVERRIDES = 3;
const LOOKBACK_DAYS = 30;
const OPENAI_MODEL = "gpt-4.1-mini";
const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

export type OverrideReviewOutcome =
  | { kind: "no_overrides"; vertical: LeadVertical }
  | { kind: "no_significant_pattern"; vertical: LeadVertical; overrideCount: number }
  | { kind: "suggested"; vertical: LeadVertical; reasonCode: string; suggestionId: string; overrideCount: number; model: string }
  | { kind: "error"; vertical: LeadVertical; error: string };

interface OverrideRow {
  id: string;
  lead_id: string;
  previous_cancel_reason_code: string | null;
  previous_cancel_rule_id: string | null;
  factor_snapshot: unknown;
  overridden_at: string;
}

interface FactorDistribution {
  // Zaehlt wie haeufig ein Faktor erfuellt war in der Override-Gruppe.
  total: number;
  factors_avg: Record<string, number>;       // Durchschnitt awarded/max
  contacts_avg: { count: number; with_email: number; hr_count: number };
  jobs_avg: { count: number };
  website_signals: {
    reachable_rate: number;
    ssl_rate: number;
    mobile_rate: number;
    has_screenshot_rate: number;
    avg_design_score: number | null;
    avg_load_ms: number;
  };
  top_decision_codes: { code: string; count: number }[];
  company_size_distribution: Record<string, number>;
  industry_distribution: Record<string, number>;
}

async function loadCurrentConfig(
  db: SupabaseClient,
  vertical: LeadVertical,
): Promise<Record<string, unknown>> {
  if (vertical === "webdesign") {
    const { data } = await db.from("webdev_scoring_config").select("*").eq("id", 1).maybeSingle();
    return { ...DEFAULT_WEBDEV_SCORING, ...(data ?? {}) };
  }
  const { data } = await db.from("recruiting_scoring_config").select("*").eq("id", 1).maybeSingle();
  return { ...DEFAULT_RECRUITING_SCORING, ...(data ?? {}) };
}

async function loadOverridesByVertical(
  db: SupabaseClient,
  vertical: LeadVertical,
): Promise<OverrideRow[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  // Join ueber leads.vertical — Override gilt nur fuer Leads der jeweiligen Vertikale.
  const { data } = await db
    .from("cancel_override_log")
    .select("id, lead_id, previous_cancel_reason_code, previous_cancel_rule_id, factor_snapshot, overridden_at, leads!inner(vertical)")
    .gte("overridden_at", since)
    .eq("leads.vertical", vertical);
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id),
      lead_id: String(row.lead_id),
      previous_cancel_reason_code: (row.previous_cancel_reason_code as string | null) ?? null,
      previous_cancel_rule_id: (row.previous_cancel_rule_id as string | null) ?? null,
      factor_snapshot: row.factor_snapshot ?? null,
      overridden_at: String(row.overridden_at),
    };
  });
}

function groupByReasonCode(rows: OverrideRow[]): Map<string, OverrideRow[]> {
  const map = new Map<string, OverrideRow[]>();
  for (const r of rows) {
    const key = r.previous_cancel_reason_code ?? "unknown";
    const list = map.get(key) ?? [];
    list.push(r);
    map.set(key, list);
  }
  return map;
}

function aggregateFactorDistribution(rows: OverrideRow[]): FactorDistribution {
  const factorTotals: Record<string, { sum: number; max: number; n: number }> = {};
  const contactsSum = { count: 0, with_email: 0, hr_count: 0 };
  const jobsSum = { count: 0 };
  let reachable = 0, ssl = 0, mobile = 0, screenshot = 0;
  let designScoreSum = 0, designScoreN = 0, loadMsSum = 0, loadMsN = 0;
  const decisionCounts = new Map<string, number>();
  const sizeCounts = new Map<string, number>();
  const industryCounts = new Map<string, number>();

  for (const r of rows) {
    const snap = r.factor_snapshot as Record<string, unknown> | null;
    if (!snap || typeof snap !== "object") continue;

    const factors = snap.factors as Record<string, { awarded: number; max: number }> | undefined;
    if (factors) {
      for (const [k, v] of Object.entries(factors)) {
        const t = factorTotals[k] ?? { sum: 0, max: 0, n: 0 };
        t.sum += v.awarded;
        t.max += v.max;
        t.n += 1;
        factorTotals[k] = t;
      }
    }

    const contacts = snap.contacts as { count?: number; with_email?: number; hr_count?: number } | undefined;
    if (contacts) {
      contactsSum.count += contacts.count ?? 0;
      contactsSum.with_email += contacts.with_email ?? 0;
      contactsSum.hr_count += contacts.hr_count ?? 0;
    }

    const jobs = snap.jobs as { count?: number } | undefined;
    if (jobs) jobsSum.count += jobs.count ?? 0;

    const web = snap.website as Record<string, unknown> | null;
    if (web) {
      if (web.reachable) reachable++;
      if (web.ssl) ssl++;
      if (web.mobile) mobile++;
      if (web.has_screenshot) screenshot++;
      const ds = web.design_score;
      if (typeof ds === "number") { designScoreSum += ds; designScoreN++; }
      const lm = web.load_ms;
      if (typeof lm === "number") { loadMsSum += lm; loadMsN++; }
    }

    const decision = snap.decision as { reason_code?: string } | undefined;
    if (decision?.reason_code) {
      decisionCounts.set(decision.reason_code, (decisionCounts.get(decision.reason_code) ?? 0) + 1);
    }

    const company = snap.company as { size_estimate?: string | null; industry?: string | null } | undefined;
    if (company?.size_estimate) {
      sizeCounts.set(company.size_estimate, (sizeCounts.get(company.size_estimate) ?? 0) + 1);
    }
    if (company?.industry) {
      industryCounts.set(company.industry, (industryCounts.get(company.industry) ?? 0) + 1);
    }
  }

  const factors_avg: Record<string, number> = {};
  for (const [k, v] of Object.entries(factorTotals)) {
    factors_avg[k] = v.max > 0 ? Math.round((v.sum / v.max) * 100) / 100 : 0;
  }

  const n = Math.max(1, rows.length);
  return {
    total: rows.length,
    factors_avg,
    contacts_avg: {
      count: contactsSum.count / n,
      with_email: contactsSum.with_email / n,
      hr_count: contactsSum.hr_count / n,
    },
    jobs_avg: { count: jobsSum.count / n },
    website_signals: {
      reachable_rate: reachable / n,
      ssl_rate: ssl / n,
      mobile_rate: mobile / n,
      has_screenshot_rate: screenshot / n,
      avg_design_score: designScoreN > 0 ? designScoreSum / designScoreN : null,
      avg_load_ms: loadMsN > 0 ? loadMsSum / loadMsN : 0,
    },
    top_decision_codes: Array.from(decisionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([code, count]) => ({ code, count })),
    company_size_distribution: Object.fromEntries(sizeCounts),
    industry_distribution: Object.fromEntries(industryCounts),
  };
}

async function callLlm(systemPrompt: string, userMessage: string): Promise<{ text: string; model: string }> {
  if (process.env.OPENAI_API_KEY) {
    const openai = new OpenAI();
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      max_tokens: 1500,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });
    const out = response.choices[0]?.message?.content;
    if (!out) throw new Error("Keine Antwort von GPT");
    return { text: out, model: OPENAI_MODEL };
  }
  const client = new Anthropic();
  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 1500,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Keine Antwort von Claude");
  return { text: block.text, model: ANTHROPIC_MODEL };
}

function stripCodeFences(s: string): string {
  let t = s.trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  return t;
}

export async function reviewFromOverrides(
  vertical: LeadVertical,
  db: SupabaseClient,
): Promise<OverrideReviewOutcome[]> {
  const rows = await loadOverridesByVertical(db, vertical);
  if (rows.length === 0) {
    return [{ kind: "no_overrides", vertical }];
  }

  const grouped = groupByReasonCode(rows);
  const significant = Array.from(grouped.entries()).filter(([, list]) => list.length >= MIN_OVERRIDES);

  if (significant.length === 0) {
    return [{ kind: "no_significant_pattern", vertical, overrideCount: rows.length }];
  }

  const currentConfig = await loadCurrentConfig(db, vertical);
  const outcomes: OverrideReviewOutcome[] = [];

  for (const [reasonCode, overrides] of significant) {
    try {
      const distribution = aggregateFactorDistribution(overrides);
      const sampleLeadIds = overrides.slice(0, 8).map((o) => o.lead_id);

      const systemPrompt = `Du bist ein Lead-Pipeline-Reviewer. Du analysierst Cancel-Overrides:
Leads die das System aussortiert hat, die ein User aber manuell zurueck in die Pipeline gezogen hat.

Vertikale: ${vertical}
Reason-Code der falschen Cancels: "${reasonCode}"
Aktuelle Scoring-Konfig: ${JSON.stringify(currentConfig)}

Aggregierte Faktor-Verteilung der ueberschriebenen Leads (n=${distribution.total}):
${JSON.stringify(distribution, null, 2)}

Deine Aufgabe:
1. Erkenne das Muster: was haben die zu Unrecht aussortierten Leads gemeinsam?
2. Schlage konkret vor:
   - Soll die Cancel-Rule mit diesem Code entschaerft/geloescht werden?
   - Soll die Scoring-Konfig angepasst werden (welcher Wert)?
   - Sind die Daten so heterogen, dass kein klares Muster da ist?
3. Bleibe konservativ — der Admin entscheidet final.

Antworte STRENG als JSON (keine Markdown-Codeblocks):
{
  "suggested_config": { /* dieselben Felder wie current_config, ggf. geaendert */ },
  "reasoning": "string 2-4 Saetze",
  "key_observations": ["beobachtung 1", "beobachtung 2", ...]
}`;

      const userMessage = `Analysiere die Faktor-Verteilung und schlage eine Anpassung vor.`;

      const llm = await callLlm(systemPrompt, userMessage);
      const parsed = JSON.parse(stripCodeFences(llm.text)) as {
        suggested_config: Record<string, unknown>;
        reasoning: string;
        key_observations: string[];
      };

      // Vorhandene pending Override-Suggestions fuer denselben Code als superseded markieren.
      await db
        .from("scoring_suggestions")
        .update({ status: "superseded" })
        .eq("vertical", vertical)
        .eq("status", "pending")
        .eq("trigger_source", "override_rate")
        .like("reasoning", `%${reasonCode}%`);

      const { data: inserted, error: insertError } = await db
        .from("scoring_suggestions")
        .insert({
          vertical,
          current_config: currentConfig,
          suggested_config: parsed.suggested_config ?? currentConfig,
          reasoning: `[${reasonCode}] ${parsed.reasoning ?? ""}`,
          key_observations: (parsed.key_observations ?? []).map((o) => String(o)).slice(0, 20),
          positive_sample_count: 0,
          negative_sample_count: overrides.length,
          llm_model: llm.model,
          sample_lead_ids: sampleLeadIds,
          factor_analysis: distribution as unknown as Record<string, unknown>,
          trigger_source: "override_rate",
        })
        .select("id")
        .single();

      if (insertError || !inserted) {
        outcomes.push({ kind: "error", vertical, error: insertError?.message ?? "Insert fehlgeschlagen" });
        continue;
      }

      outcomes.push({
        kind: "suggested",
        vertical,
        reasonCode,
        suggestionId: inserted.id,
        overrideCount: overrides.length,
        model: llm.model,
      });
    } catch (e) {
      outcomes.push({
        kind: "error",
        vertical,
        error: e instanceof Error ? e.message : "Unbekannter Fehler",
      });
    }
  }

  return outcomes;
}
