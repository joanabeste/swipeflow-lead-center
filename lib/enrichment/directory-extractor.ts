import Anthropic from "@anthropic-ai/sdk";

export interface DiscoveredCompany {
  name: string;
  website: string | null;
  description: string | null;
}

const SYSTEM_PROMPT = `Du bist ein Datenextraktions-Assistent. Du analysierst Webseiten, die Unternehmensverzeichnisse oder -listen enthalten, und extrahierst alle aufgelisteten Unternehmen.

Antworte ausschließlich mit validem JSON im folgenden Format:
{
  "companies": [
    {
      "name": "Firmenname",
      "website": "https://firmendomain.de oder null",
      "description": "Kurzbeschreibung falls vorhanden oder null"
    }
  ]
}

Regeln:
- Extrahiere ALLE Unternehmen, die auf der Seite aufgelistet sind.
- Erfinde KEINE Daten. Nur Informationen, die tatsächlich auf der Seite stehen.
- Wenn eine URL auf eine Unternehmens-Detailseite zeigt (z.B. LinkedIn-Profil), extrahiere die eigentliche Firmen-Website wenn verfügbar.
- Ignoriere Werbe-Einblendungen, Navigations-Elemente und Footer-Links.
- Antworte NUR mit dem JSON, kein anderer Text.`;

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

export async function extractCompaniesFromPage(
  pageContent: string,
  sourceUrl: string,
): Promise<DiscoveredCompany[]> {
  const client = new Anthropic();

  const response = await callWithRetry(() =>
    client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Quelle: ${sourceUrl}\n\nSeiten-Inhalt:\n\n${pageContent.slice(0, 80_000)}\n\nBitte extrahiere alle Unternehmen von dieser Seite.`,
        },
      ],
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

    const result = JSON.parse(jsonText);
    if (!Array.isArray(result.companies)) return [];

    return result.companies as DiscoveredCompany[];
  } catch (e) {
    throw new Error(
      `Claude-Antwort konnte nicht geparst werden: ${(e as Error).message}`,
    );
  }
}
