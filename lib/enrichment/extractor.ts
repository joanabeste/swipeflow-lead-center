import Anthropic from "@anthropic-ai/sdk";
import type { FetchedPage } from "./web-fetcher";
import type { EnrichmentConfig } from "@/lib/types";
import { DEFAULT_ENRICHMENT_CONFIG } from "@/lib/types";

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
  };
}

function buildSystemPrompt(config: EnrichmentConfig): string {
  // Kompakter Prompt — nur das Nötigste, kein Fülltext
  const parts: string[] = [
    "Extrahiere Geschäftsdaten aus deutschen Unternehmens-Webseiten. Antwort: NUR valides JSON.",
  ];

  // Schema — nur angeforderte Felder
  const fields: string[] = [];

  if (config.contacts_management || config.contacts_all) {
    fields.push('"contacts":[{"name":"","role":"","email":"","phone":"","source_url":""}]');
  }
  if (config.career_page) {
    fields.push('"career_page_url":""');
  }
  if (config.job_postings) {
    fields.push('"job_postings":[{"title":"","url":"","location":"","posted_date":""}]');
  }
  if (config.company_details) {
    fields.push('"additional_info":{"company_size_estimate":"","founding_year":"","specializations":[]}');
  }

  parts.push(`Format: {${fields.join(",")}}`);

  // Regeln — kompakt
  const rules: string[] = ["Nur echte Daten, null wenn nicht vorhanden."];

  if (config.contacts_management && !config.contacts_all) {
    rules.push("Kontakte: NUR Geschäftsführer/Inhaber/Management.");
  } else if (config.contacts_all) {
    rules.push("Kontakte: Alle Personen. Prio: HR > GF > Vertrieb.");
  }

  if (config.contacts_management || config.contacts_all) {
    rules.push(
      "Telefon: +49-Format. Impressum IMMER auf Tel/Fon/+49/(0 prüfen — Hauptnummer dem GF zuordnen wenn keine Durchwahl.",
      "E-Mails: persönliche UND info@/kontakt@ extrahieren.",
    );
  }

  parts.push(rules.join(" "));

  return parts.join("\n");
}

// Token-Budget: 40K chars ≈ 10K Tokens Input (statt 80K/20K)
const MAX_TOTAL_CHARS = 40_000;
// Pro Seiten-Kategorie: angepasste Limits
const CATEGORY_LIMITS: Record<string, number> = {
  impressum: 6_000,  // Kompakt, enthält die wichtigsten Daten
  kontakt: 4_000,
  karriere: 10_000,  // Kann viele Stellen enthalten
  team: 6_000,
  homepage: 4_000,   // Reduziert — meist nur Marketing
  other: 3_000,
};

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 5_000;

async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e: unknown) {
      const isOverloaded =
        (e instanceof Error && e.message.includes("529")) ||
        (e instanceof Error && e.message.toLowerCase().includes("overloaded")) ||
        (typeof e === "object" && e !== null && "status" in e && (e as { status: number }).status === 529);

      if (isOverloaded && attempt < MAX_RETRIES - 1) {
        const delay = RETRY_BASE_DELAY_MS * (attempt + 1);
        await new Promise((r) => setTimeout(r, delay));
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
  const client = new Anthropic();

  // Seiten nach Relevanz sortieren und mit kategorie-spezifischen Limits trimmen
  const priorityOrder: FetchedPage["category"][] = [
    "impressum",
    "karriere",
    "kontakt",
    "team",
    "homepage",
    "other",
  ];

  // Seiten filtern nach Config — irrelevante gar nicht erst senden
  const relevantPages = [...pages]
    .filter((p) => p.content && !p.error)
    .filter((p) => {
      // Homepage nur senden wenn andere Seiten fehlen oder wenige Daten da
      if (p.category === "homepage" && pages.filter((pp) => !pp.error && pp.category !== "homepage").length >= 2) {
        return false;
      }
      // Karriere nur wenn Jobs/Career gewünscht
      if (p.category === "karriere" && !config.job_postings && !config.career_page) return false;
      // Team nur wenn Kontakte gewünscht
      if (p.category === "team" && !config.contacts_management && !config.contacts_all) return false;
      return true;
    })
    .sort(
      (a, b) =>
        priorityOrder.indexOf(a.category) - priorityOrder.indexOf(b.category),
    );

  let totalChars = 0;
  const pageTexts: string[] = [];

  for (const page of relevantPages) {
    const remaining = MAX_TOTAL_CHARS - totalChars;
    if (remaining <= 0) break;

    const categoryLimit = CATEGORY_LIMITS[page.category] ?? 4_000;
    const limit = Math.min(remaining, categoryLimit);
    const content = page.content.slice(0, limit);

    pageTexts.push(`[${page.category}|${page.url}]\n${content}`);
    totalChars += content.length;
  }

  const userMessage = `${companyName}\n\n${pageTexts.join("\n\n")}`;

  // max_tokens dynamisch: weniger wenn nur wenige Daten erwartet
  const expectedOutput = (config.contacts_management || config.contacts_all ? 800 : 0)
    + (config.job_postings ? 1200 : 0)
    + (config.career_page ? 100 : 0)
    + (config.company_details ? 200 : 0)
    + 100; // Overhead
  const maxTokens = Math.min(Math.max(expectedOutput, 512), 3000);

  const response = await callWithRetry(() =>
    client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      temperature: 0,
      system: buildSystemPrompt(config),
      messages: [{ role: "user", content: userMessage }],
    }),
  );

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Keine Text-Antwort von Claude erhalten");
  }

  try {
    let jsonText = textBlock.text.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const raw = JSON.parse(jsonText);

    return {
      contacts: Array.isArray(raw.contacts) ? raw.contacts : [],
      career_page_url: raw.career_page_url ?? null,
      job_postings: Array.isArray(raw.job_postings) ? raw.job_postings : [],
      additional_info: raw.additional_info ?? {
        company_size_estimate: null,
        founding_year: null,
        specializations: [],
      },
    };
  } catch (e) {
    throw new Error(
      `Claude-Antwort konnte nicht als JSON geparst werden: ${(e as Error).message}`,
    );
  }
}
