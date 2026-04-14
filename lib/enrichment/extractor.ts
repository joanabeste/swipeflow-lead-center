import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { FetchedPage } from "./web-fetcher";
import type { EnrichmentConfig } from "@/lib/types";
import { DEFAULT_ENRICHMENT_CONFIG } from "@/lib/types";
import { preExtract, compressPageContent } from "./pre-extractor";

export interface EnrichmentResult {
  contacts: {
    name: string;
    role: string | null;
    email: string | null;
    phone: string | null;
    source_url: string;
  }[];
  career_page_url: string | null;
  job_postings: {
    title: string;
    url: string | null;
    location: string | null;
    posted_date: string | null;
  }[];
  additional_info: {
    company_size_estimate: string | null;
    founding_year: string | null;
    specializations: string[];
    // Firmenstammdaten aus Impressum
    company_phone: string | null;
    company_email: string | null;
    street: string | null;
    zip: string | null;
    city: string | null;
    state: string | null;
    legal_form: string | null;
    register_id: string | null;
  };
  meta: {
    llmMs: number;
    inputChars: number;
    promptTokens: number | null;
    completionTokens: number | null;
  };
}

function buildPrompt(config: EnrichmentConfig, preData: { emails: string[]; phones: string[] }): string {
  const parts: string[] = [
    "Extrahiere Geschäftsdaten aus deutschen Unternehmens-Webseiten. Antwort: NUR valides JSON.",
  ];

  // Schema
  const fields: string[] = [];
  if (config.contacts_management || config.contacts_all) {
    fields.push('"contacts":[{"name":"","role":"","email":"","phone":"","source_url":""}]');
  }
  if (config.career_page) fields.push('"career_page_url":""');
  if (config.job_postings) fields.push('"job_postings":[{"title":"","url":"","location":"","posted_date":""}]');
  if (config.company_details) {
    // Wenn Whitelist gesetzt → nur diese Felder im Schema, sonst alle
    const allowlist = config.company_details_fields;
    const includeField = (f: import("@/lib/types").CompanyDetailField) => !allowlist || allowlist.includes(f);
    const subFields: string[] = [];
    if (includeField("company_size")) subFields.push('"company_size_estimate":""');
    if (includeField("founding_year")) subFields.push('"founding_year":""');
    if (includeField("industry")) subFields.push('"specializations":[]');
    if (includeField("phone")) subFields.push('"company_phone":""');
    if (includeField("email")) subFields.push('"company_email":""');
    if (includeField("address")) {
      subFields.push('"street":""');
      subFields.push('"zip":""');
      subFields.push('"city":""');
      subFields.push('"state":""');
    }
    if (includeField("legal_form")) subFields.push('"legal_form":""');
    if (includeField("register_id")) subFields.push('"register_id":""');
    if (subFields.length > 0) {
      fields.push(`"additional_info":{${subFields.join(",")}}`);
    }
  }
  parts.push(`Format: {${fields.join(",")}}`);

  // Regeln
  const rules: string[] = ["Nur echte Daten, null wenn nicht vorhanden."];
  if (config.job_postings) {
    rules.push(
      "job_postings: ALLE offenen Positionen — auch Ausbildung, Duales Studium, Praktikum, Werkstudent, Trainee, Minijob. Titel exakt von der Seite übernehmen (inkl. '(m/w/d)' etc.). Wenn auf der Karriereseite Stellen aufgelistet sind, MUSS jede einzeln im Array stehen. URLs stehen in eckigen Klammern direkt hinter dem Text, z.B. 'Titel [https://…]' — übernimm sie als `url`.",
    );
  }
  if (config.company_details) {
    const allowlist = config.company_details_fields;
    const includeField = (f: import("@/lib/types").CompanyDetailField) => !allowlist || allowlist.includes(f);
    const hints: string[] = [];
    hints.push("Firmenstammdaten bevorzugt aus Impressum.");
    if (includeField("legal_form")) hints.push("legal_form: z.B. 'GmbH', 'AG', 'UG', 'GbR', 'e.K.'.");
    if (includeField("register_id")) hints.push("register_id: z.B. 'HRB 12345 Amtsgericht München'.");
    if (includeField("address")) hints.push("street: inkl. Hausnummer. zip: 5-stellig. state: Bundesland (z.B. 'Bayern').");
    if (includeField("phone")) hints.push("company_phone: +49-Format.");
    if (allowlist && allowlist.length > 0) {
      hints.push(`FOKUS: Suche gezielt nur nach ${allowlist.join(", ")}. Ignoriere andere Firmendaten.`);
    }
    rules.push(hints.join(" "));
  }
  if (config.contacts_management && !config.contacts_all) {
    rules.push("Kontakte: NUR Geschäftsführer/Inhaber/Management.");
  } else if (config.contacts_all) {
    rules.push(
      "Kontakte: ALLE auf der Website auffindbaren Ansprechpartner — auch wenn nur Name + Rolle ohne E-Mail/Telefon. " +
      "PFLICHT: HR-/Personal-Verantwortliche separat und einzeln erfassen — jede Person mit Personal-, HR-, Recruiting-, " +
      "Talent-, Ausbildungs-, oder Bewerbungs-Bezug muss als eigener contacts-Eintrag mit präziser role stehen " +
      "(z.B. 'Personalleitung', 'HR-Manager/in', 'Personalreferent/in', 'Recruiting', 'Talent Acquisition', " +
      "'Ausbildungsleitung', 'Ansprechpartner Bewerbung'). Reihenfolge im Array: HR > GF > Vertrieb > Sonstige. " +
      "Wenn auf der Karriereseite ein 'Ansprechpartner für Bewerbungen' o.ä. genannt wird, MUSS dieser im Array stehen.",
    );
  }
  if (config.contacts_management || config.contacts_all) {
    rules.push("Telefon: +49-Format. Impressum auf Tel/Fon/+49/(0 prüfen.");
    if (preData.emails.length > 0) {
      rules.push(`Bereits gefundene E-Mails: ${preData.emails.join(", ")}. Ordne sie den passenden Personen zu.`);
    }
    if (preData.phones.length > 0) {
      rules.push(`Bereits gefundene Telefonnummern: ${preData.phones.join(", ")}. Ordne sie zu.`);
    }
  }
  parts.push(rules.join(" "));

  return parts.join("\n");
}

// Token-Limits
const MAX_TOTAL_CHARS = 40_000; // erhöht, damit mehrere Karriere-/Job-Detailseiten reinpassen
const CATEGORY_LIMITS: Record<string, number> = {
  impressum: 5_000,
  kontakt: 3_000,
  karriere: 8_000,
  team: 4_000,
  homepage: 2_000,
  other: 2_000,
};
// Pro-Seite-Limit für Folge-Karriereseiten (Job-Detail-Links nach der Hauptseite)
const KARRIERE_FOLLOWUP_LIMIT = 3_500;

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 3_000;

async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e: unknown) {
      const isRetryable =
        (e instanceof Error && (e.message.includes("529") || e.message.includes("overloaded") || e.message.includes("rate_limit") || e.message.includes("429")));

      if (isRetryable && attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, RETRY_BASE_DELAY_MS * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw new Error("Max retries erreicht");
}

export async function extractFromPages(
  companyName: string,
  pages: FetchedPage[],
  config: EnrichmentConfig = DEFAULT_ENRICHMENT_CONFIG,
): Promise<EnrichmentResult> {
  const priorityOrder: FetchedPage["category"][] = ["impressum", "karriere", "kontakt", "team", "homepage", "other"];

  const relevantPages = [...pages]
    .filter((p) => p.content && !p.error)
    .filter((p) => {
      if (p.category === "homepage" && pages.filter((pp) => !pp.error && pp.category !== "homepage").length >= 2) return false;
      if (p.category === "karriere" && !config.job_postings && !config.career_page) return false;
      if (p.category === "team" && !config.contacts_management && !config.contacts_all) return false;
      return true;
    })
    .sort((a, b) => priorityOrder.indexOf(a.category) - priorityOrder.indexOf(b.category));

  // Pre-Extraktion: E-Mails, Telefonnummern per Regex finden
  const allText = relevantPages.map((p) => p.content).join("\n");
  const preData = preExtract(allText);

  // Seiten komprimieren — nur relevante Abschnitte senden
  let totalChars = 0;
  const pageTexts: string[] = [];

  let karriereSeen = 0;
  for (const page of relevantPages) {
    const remaining = MAX_TOTAL_CHARS - totalChars;
    if (remaining <= 0) break;
    // Folge-Karriereseiten bekommen weniger Budget als die erste, damit Detail-
    // Seiten nicht den ganzen Kontext fressen.
    const baseLimit =
      page.category === "karriere" && karriereSeen > 0
        ? KARRIERE_FOLLOWUP_LIMIT
        : CATEGORY_LIMITS[page.category] ?? 2_000;
    const limit = Math.min(remaining, baseLimit);
    // Karriereseiten NICHT keyword-filtern — die ganze Seite ist relevant.
    // Sonst werden Joblisten ohne "Stelle"/"Job"-Wortlaut (z.B. nur "Ausbildung
    // zum Industriekaufmann (m/w/d)") aussortiert.
    const compressed =
      page.category === "karriere"
        ? page.content.slice(0, limit)
        : compressPageContent(page.content, limit);
    pageTexts.push(`[${page.category}|${page.url}]\n${compressed}`);
    totalChars += compressed.length;
    if (page.category === "karriere") karriereSeen++;
  }

  const systemPrompt = buildPrompt(config, preData);
  const userMessage = `${companyName}\n\n${pageTexts.join("\n\n")}`;

  // DEBUG: aktivierbar via ENRICH_DEBUG=1 — zeigt geholte Seiten + LLM-Input-Größe
  if (process.env.ENRICH_DEBUG) {
    console.log("[ENRICH_DEBUG]", companyName);
    for (const p of pages) {
      console.log("  page:", p.category, p.url, p.error ? `ERROR: ${p.error}` : `${p.content.length} chars`);
    }
    console.log("  relevant pages →", relevantPages.map((p) => `${p.category}(${p.url})`).join(", "));
    const karriere = relevantPages.find((p) => p.category === "karriere");
    if (karriere) {
      const hasJobs = /ausbildung|industriekaufmann|industriemechaniker|maschinen|stellenangebot/i.test(karriere.content);
      console.log("  karriere content has job-keywords:", hasJobs);
    }
    console.log("  total userMessage chars:", userMessage.length);
  }

  // Dynamische max_tokens
  const expectedOutput = (config.contacts_management || config.contacts_all ? 600 : 0)
    + (config.job_postings ? 1000 : 0)
    + (config.career_page ? 80 : 0)
    + (config.company_details ? 350 : 0)
    + 80;
  const maxTokens = Math.min(Math.max(expectedOutput, 400), 2500);

  // GPT-4.1-mini als primäres Modell (30x günstiger), Fallback auf Claude
  let jsonText: string;
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;
  const llmStart = Date.now();

  if (process.env.OPENAI_API_KEY) {
    jsonText = await callWithRetry(async () => {
      const openai = new OpenAI();
      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        max_tokens: maxTokens,
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      });
      const text = response.choices[0]?.message?.content;
      if (!text) throw new Error("Keine Antwort von GPT erhalten");
      promptTokens = response.usage?.prompt_tokens ?? null;
      completionTokens = response.usage?.completion_tokens ?? null;
      return text;
    });
  } else {
    // Fallback: Claude
    jsonText = await callWithRetry(async () => {
      const client = new Anthropic();
      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: maxTokens,
        temperature: 0,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });
      const block = response.content.find((b) => b.type === "text");
      if (!block || block.type !== "text") throw new Error("Keine Antwort von Claude erhalten");
      promptTokens = response.usage?.input_tokens ?? null;
      completionTokens = response.usage?.output_tokens ?? null;
      return block.text;
    });
  }
  const llmMs = Date.now() - llmStart;

  // JSON parsen
  try {
    let cleaned = jsonText.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const raw = JSON.parse(cleaned);

    if (process.env.ENRICH_DEBUG) {
      console.log("[ENRICH_DEBUG] LLM job_postings:", JSON.stringify(raw.job_postings ?? []));
    }

    return {
      contacts: Array.isArray(raw.contacts) ? raw.contacts : [],
      career_page_url: raw.career_page_url ?? null,
      job_postings: Array.isArray(raw.job_postings) ? raw.job_postings : [],
      additional_info: {
        company_size_estimate: raw.additional_info?.company_size_estimate ?? null,
        founding_year: raw.additional_info?.founding_year ?? null,
        specializations: Array.isArray(raw.additional_info?.specializations) ? raw.additional_info.specializations : [],
        company_phone: raw.additional_info?.company_phone ?? null,
        company_email: raw.additional_info?.company_email ?? null,
        street: raw.additional_info?.street ?? null,
        zip: raw.additional_info?.zip ?? null,
        city: raw.additional_info?.city ?? null,
        state: raw.additional_info?.state ?? null,
        legal_form: raw.additional_info?.legal_form ?? null,
        register_id: raw.additional_info?.register_id ?? null,
      },
      meta: {
        llmMs,
        inputChars: userMessage.length,
        promptTokens,
        completionTokens,
      },
    };
  } catch (e) {
    throw new Error(`Antwort konnte nicht als JSON geparst werden: ${(e as Error).message}`);
  }
}
