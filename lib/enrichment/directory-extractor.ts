import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export interface DiscoveredCompany {
  name: string;
  website: string | null;
  description: string | null;
}

const SYSTEM_PROMPT = `Extrahiere alle Unternehmen von dieser Verzeichnis-Seite. Antwort: NUR valides JSON.
Format: {"companies":[{"name":"","website":"https://... oder null","description":"kurz oder null"}]}
Nur echte Daten. Ignoriere Werbung, Navigation, Footer.`;

const MAX_RETRIES = 3;

async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e: unknown) {
      const isRetryable = e instanceof Error && (
        e.message.includes("529") || e.message.includes("overloaded") ||
        e.message.includes("429") || e.message.includes("rate_limit")
      );
      if (isRetryable && attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw new Error("Max retries erreicht");
}

export async function extractCompaniesFromPage(
  pageContent: string,
  sourceUrl: string,
): Promise<DiscoveredCompany[]> {
  const userMessage = `Quelle: ${sourceUrl}\n\n${pageContent.slice(0, 50_000)}\n\nExtrahiere alle Unternehmen.`;

  let jsonText: string;

  if (process.env.OPENAI_API_KEY) {
    jsonText = await callWithRetry(async () => {
      const openai = new OpenAI();
      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        max_tokens: 3000,
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      });
      return response.choices[0]?.message?.content ?? "";
    });
  } else {
    jsonText = await callWithRetry(async () => {
      const client = new Anthropic();
      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 3000,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });
      const block = response.content.find((b) => b.type === "text");
      return block?.type === "text" ? block.text : "";
    });
  }

  try {
    let cleaned = jsonText.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    const result = JSON.parse(cleaned);
    return Array.isArray(result.companies) ? result.companies : [];
  } catch (e) {
    throw new Error(`Antwort konnte nicht geparst werden: ${(e as Error).message}`);
  }
}
