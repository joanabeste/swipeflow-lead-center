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
  const sections: string[] = [];

  sections.push(
    "Du bist ein Datenextraktions-Assistent. Du analysierst Webseiten-Inhalte deutscher Unternehmen und extrahierst strukturierte Geschäftsinformationen.",
  );
  sections.push("Antworte ausschließlich mit validem JSON im folgenden Format:");

  // JSON-Schema dynamisch aufbauen
  const schema: Record<string, string> = {};

  if (config.contacts_management || config.contacts_all) {
    schema.contacts = `[
    {
      "name": "Vor- und Nachname",
      "role": "Position/Rolle",
      "email": "email@example.de oder null",
      "phone": "+49... oder null",
      "source_url": "URL der Seite"
    }
  ]`;
  } else {
    schema.contacts = "[]";
  }

  if (config.career_page) {
    schema.career_page_url = '"URL der Karriereseite oder null"';
  }

  if (config.job_postings) {
    schema.job_postings = `[
    {
      "title": "Stellenbezeichnung",
      "url": "Link zur Stellenanzeige oder null",
      "location": "Arbeitsort oder null",
      "posted_date": "Datum oder null"
    }
  ]`;
  }

  if (config.company_details) {
    schema.additional_info = `{
    "company_size_estimate": "Geschätzte Mitarbeiterzahl als Zahl oder null",
    "founding_year": "Gründungsjahr oder null",
    "specializations": ["Fachgebiet 1", "Fachgebiet 2"]
  }`;
  }

  sections.push("{\n" + Object.entries(schema).map(([k, v]) => `  "${k}": ${v}`).join(",\n") + "\n}");

  // Regeln
  const rules: string[] = [
    "Extrahiere NUR Informationen, die tatsächlich auf den Seiten stehen.",
    "Erfinde KEINE Daten. Wenn eine Information nicht vorhanden ist, setze null.",
  ];

  if (config.contacts_management && !config.contacts_all) {
    rules.push(
      "Extrahiere NUR Geschäftsführer, Inhaber und Management-Positionen als Kontakte. Ignoriere alle anderen Personen.",
    );
  } else if (config.contacts_all) {
    rules.push(
      "Extrahiere ALLE Kontaktpersonen. Priorisiere: 1. Personalverantwortliche (HR, Personal), 2. Geschäftsführer, 3. Vertrieb/Ansprechpartner.",
    );
  }

  if (config.contacts_management || config.contacts_all) {
    rules.push(
      "Bei E-Mail-Adressen: Extrahiere persönliche E-Mails UND allgemeine Adressen (info@, kontakt@).",
      "Gib die source_url an, von welcher Seite jeder Kontakt stammt.",
      "Bei Telefonnummern: Normalisiere auf deutsches Format mit +49.",
      "WICHTIG: Prüfe das Impressum BESONDERS auf Telefonnummern. Deutsche Impressum-Seiten enthalten fast immer eine Telefonnummer. Suche nach Patterns wie 'Tel:', 'Telefon:', 'Fon:', 'Fax:', '+49', '0800', '(0'. Wenn ein Geschäftsführer keine direkte Durchwahl hat, ordne ihm die Hauptnummer aus dem Impressum zu.",
    );
  }

  rules.push("Antworte NUR mit dem JSON, kein anderer Text.");

  sections.push("\nRegeln:\n" + rules.map((r) => `- ${r}`).join("\n"));

  return sections.join("\n\n");
}

const MAX_TOTAL_CHARS = 80_000;
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

  // Seiten-Inhalte zusammenbauen, Token-Budget einhalten
  let totalChars = 0;
  const pageTexts: string[] = [];

  // Priorität: Impressum, Karriere, Kontakt, Team, Homepage
  const priorityOrder: FetchedPage["category"][] = [
    "impressum",
    "karriere",
    "kontakt",
    "team",
    "homepage",
    "other",
  ];

  const sortedPages = [...pages]
    .filter((p) => p.content && !p.error)
    .sort(
      (a, b) =>
        priorityOrder.indexOf(a.category) - priorityOrder.indexOf(b.category),
    );

  for (const page of sortedPages) {
    const remaining = MAX_TOTAL_CHARS - totalChars;
    if (remaining <= 0) break;
    const content = page.content.slice(0, remaining);
    pageTexts.push(
      `--- Seite: ${page.category} (${page.url}) ---\n${content}`,
    );
    totalChars += content.length;
  }

  const requestParts: string[] = [];
  if (config.contacts_management && !config.contacts_all) {
    requestParts.push("Geschäftsführer und Management-Kontakte");
  } else if (config.contacts_all) {
    requestParts.push("alle Kontaktpersonen");
  }
  if (config.job_postings) requestParts.push("Stellenanzeigen");
  if (config.career_page) requestParts.push("Karriereseite");
  if (config.company_details) requestParts.push("Unternehmensdetails");

  const requestText = requestParts.length > 0
    ? `Bitte extrahiere: ${requestParts.join(", ")}.`
    : "Bitte extrahiere alle verfügbaren Informationen.";

  const userMessage = `Firma: ${companyName}\n\nFolgende Seiten wurden abgerufen:\n\n${pageTexts.join("\n\n")}\n\n${requestText}`;

  const response = await callWithRetry(() =>
    client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      temperature: 0,
      system: buildSystemPrompt(config),
      messages: [{ role: "user", content: userMessage }],
    }),
  );

  // Response parsen
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Keine Text-Antwort von Claude erhalten");
  }

  try {
    // JSON aus der Antwort extrahieren (ggf. Markdown-Code-Block entfernen)
    let jsonText = textBlock.text.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const raw = JSON.parse(jsonText);

    // Ergebnis normalisieren — fehlende Felder mit Defaults füllen
    const result: EnrichmentResult = {
      contacts: Array.isArray(raw.contacts) ? raw.contacts : [],
      career_page_url: raw.career_page_url ?? null,
      job_postings: Array.isArray(raw.job_postings) ? raw.job_postings : [],
      additional_info: raw.additional_info ?? {
        company_size_estimate: null,
        founding_year: null,
        specializations: [],
      },
    };

    return result;
  } catch (e) {
    throw new Error(
      `Claude-Antwort konnte nicht als JSON geparst werden: ${(e as Error).message}`,
    );
  }
}
