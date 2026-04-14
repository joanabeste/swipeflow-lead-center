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
  if (config.company_details) fields.push('"additional_info":{"company_size_estimate":"","founding_year":"","specializations":[],"company_phone":"","company_email":"","street":"","zip":"","city":"","state":"","legal_form":"","register_id":""}');
  parts.push(`Format: {${fields.join(",")}}`);

  // Regeln
  const rules: string[] = ["Nur echte Daten, null wenn nicht vorhanden."];
  if (config.company_details) {
    rules.push("Firmenstammdaten bevorzugt aus Impressum. legal_form: z.B. 'GmbH', 'AG', 'UG', 'GbR', 'e.K.'. register_id: z.B. 'HRB 12345 Amtsgericht München'. street: inkl. Hausnummer. zip: 5-stellig. state: Bundesland (z.B. 'Bayern'). company_phone: +49-Format.");
  }
  if (config.contacts_management && !config.contacts_all) {
    rules.push("Kontakte: NUR Geschäftsführer/Inhaber/Management.");
  } else if (config.contacts_all) {
    rules.push("Kontakte: Alle Personen. Prio: HR > GF > Vertrieb.");
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
const MAX_TOTAL_CHARS = 25_000; // Weiter reduziert dank Pre-Extraktion
const CATEGORY_LIMITS: Record<string, number> = {
  impressum: 5_000,
  kontakt: 3_000,
  karriere: 8_000,
  team: 4_000,
  homepage: 2_000,
  other: 2_000,
};

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

  for (const page of relevantPages) {
    const remaining = MAX_TOTAL_CHARS - totalChars;
    if (remaining <= 0) break;
    const limit = Math.min(remaining, CATEGORY_LIMITS[page.category] ?? 2_000);
    const compressed = compressPageContent(page.content, limit);
    pageTexts.push(`[${page.category}|${page.url}]\n${compressed}`);
    totalChars += compressed.length;
  }

  const systemPrompt = buildPrompt(config, preData);
  const userMessage = `${companyName}\n\n${pageTexts.join("\n\n")}`;

  // Dynamische max_tokens
  const expectedOutput = (config.contacts_management || config.contacts_all ? 600 : 0)
    + (config.job_postings ? 1000 : 0)
    + (config.career_page ? 80 : 0)
    + (config.company_details ? 350 : 0)
    + 80;
  const maxTokens = Math.min(Math.max(expectedOutput, 400), 2500);

  // GPT-4.1-mini als primäres Modell (30x günstiger), Fallback auf Claude
  let jsonText: string;

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
      return block.text;
    });
  }

  // JSON parsen
  try {
    let cleaned = jsonText.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const raw = JSON.parse(cleaned);

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
    };
  } catch (e) {
    throw new Error(`Antwort konnte nicht als JSON geparst werden: ${(e as Error).message}`);
  }
}
