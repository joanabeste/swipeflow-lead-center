/**
 * KI-gestuetzter Scoring-Reviewer.
 *
 * Sammelt Lead-Stichproben (positiv vs. negativ — basierend auf
 * `custom_lead_statuses.learning_signal` plus harten Negativ-Status), schickt sie
 * mit der aktuellen Scoring-Konfiguration an ein LLM und persistiert dessen
 * Vorschlag in `scoring_suggestions`. Der Admin entscheidet im UI per Diff,
 * ob der Vorschlag uebernommen wird.
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_RECRUITING_SCORING,
  DEFAULT_WEBDEV_SCORING,
  type LeadVertical,
  type RecruitingScoringConfig,
  type WebdevScoringConfig,
} from "@/lib/types";

const SAMPLE_LIMIT = 30;
const MIN_SAMPLES = 5;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 3_000;

const OPENAI_MODEL = "gpt-4.1-mini";
const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

export type ScoringConfigUnion = WebdevScoringConfig | RecruitingScoringConfig;

export type ReviewOutcome =
  | { kind: "suggested"; suggestionId: string; positiveCount: number; negativeCount: number; model: string }
  | { kind: "skipped"; reason: string; positiveCount: number; negativeCount: number }
  | { kind: "error"; error: string };

interface LeadSample {
  status: string;
  crm_status_id: string | null;
  cancel_reason: string | null;
  has_ssl: boolean | null;
  is_mobile_friendly: boolean | null;
  page_speed_score: number | null;
  website_tech: string | null;
  website_age_estimate: string | null;
  website_issues: string[] | null;
  company_size: string | null;
  industry: string | null;
  contact_count: number;
  hr_contact_count: number;
  job_posting_count: number;
}

async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e: unknown) {
      const isRetryable =
        e instanceof Error &&
        (e.message.includes("529") ||
          e.message.includes("overloaded") ||
          e.message.includes("rate_limit") ||
          e.message.includes("429"));
      if (isRetryable && attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, RETRY_BASE_DELAY_MS * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw new Error("Max retries erreicht");
}

async function loadCurrentConfig(
  db: SupabaseClient,
  vertical: LeadVertical,
): Promise<ScoringConfigUnion> {
  if (vertical === "webdesign") {
    const { data } = await db.from("webdev_scoring_config").select("*").eq("id", 1).maybeSingle();
    return { ...DEFAULT_WEBDEV_SCORING, ...(data ?? {}) } as WebdevScoringConfig;
  }
  const { data } = await db.from("recruiting_scoring_config").select("*").eq("id", 1).maybeSingle();
  return { ...DEFAULT_RECRUITING_SCORING, ...(data ?? {}) } as RecruitingScoringConfig;
}

async function loadStatusBuckets(db: SupabaseClient): Promise<{ positive: string[]; negative: string[] }> {
  const { data } = await db
    .from("custom_lead_statuses")
    .select("id, learning_signal")
    .not("learning_signal", "is", null);
  const positive: string[] = [];
  const negative: string[] = [];
  for (const row of data ?? []) {
    if (row.learning_signal === "positive") positive.push(row.id);
    else if (row.learning_signal === "negative") negative.push(row.id);
  }
  return { positive, negative };
}

async function loadSamples(
  db: SupabaseClient,
  vertical: LeadVertical,
  positiveStatusIds: string[],
  negativeStatusIds: string[],
): Promise<{ positives: LeadSample[]; negatives: LeadSample[] }> {
  const baseSelect =
    "id, status, crm_status_id, cancel_reason, has_ssl, is_mobile_friendly, page_speed_score, " +
    "website_tech, website_age_estimate, website_issues, company_size, industry, " +
    "lead_contacts(role), lead_job_postings(id)";

  // Positiv: Leads in positiven CRM-Statuses (anhand learning_signal markiert).
  const positiveQuery = db
    .from("leads")
    .select(baseSelect)
    .eq("vertical", vertical)
    .order("updated_at", { ascending: false })
    .limit(SAMPLE_LIMIT);
  if (positiveStatusIds.length > 0) {
    positiveQuery.in("crm_status_id", positiveStatusIds);
  } else {
    // Fallback wenn keine positiven Status definiert: 'qualified' oder 'exported' als Proxy.
    positiveQuery.in("status", ["qualified", "exported"]);
  }
  const { data: posRaw } = await positiveQuery;

  // Negativ: harte Negative (filtered/cancelled) ODER explizit negativ markierte CRM-Stati.
  const negativeQuery = db
    .from("leads")
    .select(baseSelect)
    .eq("vertical", vertical)
    .order("updated_at", { ascending: false })
    .limit(SAMPLE_LIMIT);
  if (negativeStatusIds.length > 0) {
    negativeQuery.or(
      `status.in.(filtered,cancelled),crm_status_id.in.(${negativeStatusIds.map((id) => `"${id}"`).join(",")})`,
    );
  } else {
    negativeQuery.in("status", ["filtered", "cancelled"]);
  }
  const { data: negRaw } = await negativeQuery;

  const project = (rows: unknown): LeadSample[] =>
    (Array.isArray(rows) ? rows : []).map((row) => {
      const r = row as Record<string, unknown>;
      const contacts = (r.lead_contacts as Array<{ role: string | null }> | null) ?? [];
      const jobs = (r.lead_job_postings as Array<{ id: string }> | null) ?? [];
      return {
        status: String(r.status ?? ""),
        crm_status_id: (r.crm_status_id as string | null) ?? null,
        cancel_reason: (r.cancel_reason as string | null) ?? null,
        has_ssl: (r.has_ssl as boolean | null) ?? null,
        is_mobile_friendly: (r.is_mobile_friendly as boolean | null) ?? null,
        page_speed_score: (r.page_speed_score as number | null) ?? null,
        website_tech: (r.website_tech as string | null) ?? null,
        website_age_estimate: (r.website_age_estimate as string | null) ?? null,
        website_issues: (r.website_issues as string[] | null) ?? null,
        company_size: (r.company_size as string | null) ?? null,
        industry: (r.industry as string | null) ?? null,
        contact_count: contacts.length,
        hr_contact_count: contacts.filter((c) => isHrRole(c.role)).length,
        job_posting_count: jobs.length,
      };
    });

  return { positives: project(posRaw), negatives: project(negRaw) };
}

function isHrRole(role: string | null | undefined): boolean {
  if (!role) return false;
  const lc = role.toLowerCase();
  return /(hr|human resources|personal|recruit|talent|ausbildung|bewerb)/.test(lc);
}

function buildSystemPrompt(vertical: LeadVertical, current: ScoringConfigUnion): string {
  const fieldDocs =
    vertical === "webdesign"
      ? `
Felder in webdev_scoring_config:
- strictness ('lax'|'normal'|'strict'): wie streng die Design-Bewertung ausfaellt.
- design_focus (string|null): optionaler Freitext-Hinweis fuer das Design-Kriterium.
- min_issues_to_qualify (int >= 1): wie viele Website-Probleme (SSL fehlt, langsam, alt, etc.) ein Lead haben muss, um qualifiziert zu werden.
- slow_load_threshold_ms (>=500): ab wann eine Seite als langsam gilt.
- very_slow_load_threshold_ms (>= slow + 500): ab wann sehr langsam.
- check_ssl, check_responsive, check_meta_tags, check_alt_tags, check_outdated_html (bool): einzelne Checks an/aus.
- allow_leads_without_website (bool): Leads ohne Website akzeptieren statt cancellen.`
      : `
Felder in recruiting_scoring_config:
- min_job_postings_to_qualify (int >= 0): wie viele offene Stellen ein Lead mindestens haben muss.
- require_hr_contact (bool): wenn true, MUSS mindestens ein HR-Kontakt vorhanden sein.
- require_contact_email (bool): wenn true, MUSS mindestens ein Kontakt mit E-Mail vorhanden sein.`;

  return `Du bist ein Lead-Qualifizierungs-Reviewer. Du analysierst Stichproben aus Leads, die der Sales-Workflow als "positiv" (relevante/gute Leads) bzw. "negativ" (unpassende/aussortierte Leads) markiert hat, und schlaegst Anpassungen an der ${vertical}-Scoring-Konfiguration vor.

${fieldDocs}

Aktuelle Konfiguration:
${JSON.stringify(current, null, 2)}

Deine Aufgabe:
1. Erkenne Muster in den positiven vs. negativen Stichproben.
2. Falls die aktuelle Config gut zu den Daten passt: belasse sie unveraendert (suggested_config = aktuelle Config) und begruende.
3. Falls die Config zu locker oder zu streng ist: schlage konkret veraenderte Werte vor.
4. Bleibe konservativ — keine drastischen Spruenge ohne klares Signal in den Daten.

Antwort STRENG als JSON in folgendem Schema:
{
  "suggested_config": { /* exakt dieselben Felder wie current_config */ },
  "reasoning": "string — Kernbegruendung in 1-3 Saetzen",
  "key_observations": ["beobachtung 1", "beobachtung 2", ...]
}
Keine zusaetzlichen Felder, keine Markdown-Codeblocks, kein Vor-/Nachtext.`;
}

function buildUserMessage(
  positives: LeadSample[],
  negatives: LeadSample[],
): string {
  const fmt = (samples: LeadSample[]) =>
    samples
      .map((s, i) => `[${i + 1}] ${JSON.stringify(s)}`)
      .join("\n");
  return `POSITIVE Stichproben (gute Leads, n=${positives.length}):
${fmt(positives)}

NEGATIVE Stichproben (aussortierte/abgelehnte Leads, n=${negatives.length}):
${fmt(negatives)}`;
}

function stripCodeFences(s: string): string {
  let t = s.trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  return t;
}

interface LlmRawOutput {
  suggested_config: Record<string, unknown>;
  reasoning: string;
  key_observations: string[];
}

function validateSuggested(
  vertical: LeadVertical,
  raw: LlmRawOutput,
  current: ScoringConfigUnion,
): { ok: true; suggested: ScoringConfigUnion } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "no_object" };
  if (typeof raw.reasoning !== "string" || !raw.reasoning.trim())
    return { ok: false, error: "missing_reasoning" };
  if (!Array.isArray(raw.key_observations))
    return { ok: false, error: "missing_observations" };
  const sc = raw.suggested_config;
  if (!sc || typeof sc !== "object") return { ok: false, error: "missing_suggested_config" };

  if (vertical === "webdesign") {
    const cur = current as WebdevScoringConfig;
    const out: WebdevScoringConfig = {
      strictness: ["lax", "normal", "strict"].includes(String(sc.strictness))
        ? (sc.strictness as WebdevScoringConfig["strictness"])
        : cur.strictness,
      design_focus:
        typeof sc.design_focus === "string"
          ? sc.design_focus.trim() || null
          : sc.design_focus === null
            ? null
            : cur.design_focus,
      min_issues_to_qualify: Math.max(
        1,
        Math.min(20, Number(sc.min_issues_to_qualify) || cur.min_issues_to_qualify),
      ),
      slow_load_threshold_ms: Math.max(
        500,
        Number(sc.slow_load_threshold_ms) || cur.slow_load_threshold_ms,
      ),
      very_slow_load_threshold_ms: Math.max(
        Math.max(500, Number(sc.slow_load_threshold_ms) || cur.slow_load_threshold_ms) + 500,
        Number(sc.very_slow_load_threshold_ms) || cur.very_slow_load_threshold_ms,
      ),
      check_ssl: typeof sc.check_ssl === "boolean" ? sc.check_ssl : cur.check_ssl,
      check_responsive:
        typeof sc.check_responsive === "boolean" ? sc.check_responsive : cur.check_responsive,
      check_meta_tags:
        typeof sc.check_meta_tags === "boolean" ? sc.check_meta_tags : cur.check_meta_tags,
      check_alt_tags: typeof sc.check_alt_tags === "boolean" ? sc.check_alt_tags : cur.check_alt_tags,
      check_outdated_html:
        typeof sc.check_outdated_html === "boolean" ? sc.check_outdated_html : cur.check_outdated_html,
      allow_leads_without_website:
        typeof sc.allow_leads_without_website === "boolean"
          ? sc.allow_leads_without_website
          : cur.allow_leads_without_website,
    };
    return { ok: true, suggested: out };
  }

  const cur = current as RecruitingScoringConfig;
  const out: RecruitingScoringConfig = {
    min_job_postings_to_qualify: Math.max(
      0,
      Math.min(50, Number(sc.min_job_postings_to_qualify) ?? cur.min_job_postings_to_qualify),
    ),
    require_hr_contact:
      typeof sc.require_hr_contact === "boolean" ? sc.require_hr_contact : cur.require_hr_contact,
    require_contact_email:
      typeof sc.require_contact_email === "boolean"
        ? sc.require_contact_email
        : cur.require_contact_email,
  };
  return { ok: true, suggested: out };
}

async function callLlm(systemPrompt: string, userMessage: string): Promise<{ text: string; model: string }> {
  if (process.env.OPENAI_API_KEY) {
    const text = await callWithRetry(async () => {
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
      if (!out) throw new Error("Keine Antwort von GPT erhalten");
      return out;
    });
    return { text, model: OPENAI_MODEL };
  }

  const text = await callWithRetry(async () => {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 1500,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });
    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") throw new Error("Keine Antwort von Claude erhalten");
    return block.text;
  });
  return { text, model: ANTHROPIC_MODEL };
}

export async function generateScoringSuggestion(
  vertical: LeadVertical,
  db: SupabaseClient,
): Promise<ReviewOutcome> {
  const buckets = await loadStatusBuckets(db);
  const samples = await loadSamples(db, vertical, buckets.positive, buckets.negative);
  const positiveCount = samples.positives.length;
  const negativeCount = samples.negatives.length;

  if (positiveCount < MIN_SAMPLES || negativeCount < MIN_SAMPLES) {
    return {
      kind: "skipped",
      reason: `Zu wenig Trainings-Daten (positive=${positiveCount}, negative=${negativeCount}, benoetigt mind. ${MIN_SAMPLES} pro Bucket).`,
      positiveCount,
      negativeCount,
    };
  }

  const current = await loadCurrentConfig(db, vertical);
  const systemPrompt = buildSystemPrompt(vertical, current);
  const userMessage = buildUserMessage(samples.positives, samples.negatives);

  let raw: LlmRawOutput;
  let model: string;
  try {
    const result = await callLlm(systemPrompt, userMessage);
    model = result.model;
    raw = JSON.parse(stripCodeFences(result.text)) as LlmRawOutput;
  } catch (e) {
    return { kind: "error", error: e instanceof Error ? e.message : "LLM-Fehler" };
  }

  const validation = validateSuggested(vertical, raw, current);
  if (!validation.ok) {
    return { kind: "error", error: `Ungueltige LLM-Antwort: ${validation.error}` };
  }

  // Bestehende pending Vorschlaege fuer dasselbe Vertical auf 'superseded' setzen.
  await db
    .from("scoring_suggestions")
    .update({ status: "superseded" })
    .eq("vertical", vertical)
    .eq("status", "pending");

  const { data: inserted, error: insertError } = await db
    .from("scoring_suggestions")
    .insert({
      vertical,
      current_config: current as unknown as Record<string, unknown>,
      suggested_config: validation.suggested as unknown as Record<string, unknown>,
      reasoning: raw.reasoning.trim(),
      key_observations: (raw.key_observations ?? []).map((o) => String(o)).slice(0, 20),
      positive_sample_count: positiveCount,
      negative_sample_count: negativeCount,
      llm_model: model,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return { kind: "error", error: insertError?.message ?? "Insert fehlgeschlagen" };
  }

  return {
    kind: "suggested",
    suggestionId: inserted.id,
    positiveCount,
    negativeCount,
    model,
  };
}
