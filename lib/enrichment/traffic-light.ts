import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { TrafficLightRating } from "@/lib/types";

// Gleiche Modelle wie die bestehende Vision-Analyse (website-analyzer.ts).
const MODEL_OPENAI = "gpt-4o";
const MODEL_ANTHROPIC = "claude-sonnet-4-20250514";

export interface TrafficLightSignals {
  designScore: number | null; // website_design_score 0-100 (höher = moderner)
  ageEstimate: string | null; // "veraltet" | "durchschnittlich" | "modern"
  issues: string[]; // website_issues
  visualIssues: string[]; // website_visual_issues
  hasSsl: boolean | null;
  isMobileFriendly: boolean | null;
  technology: string | null;
  statusCode: number | null;
  pageTitle: string | null;
  metaDescription: string | null;
}

export interface TrafficLightInput {
  companyName: string;
  website: string | null;
  description: string | null; // kann Firmenstatus enthalten (NorthData: aufgelöst/liquidiert)
  screenshotBuffer: Buffer | null; // wenn vorhanden → Vision, sonst Text-only
  signals: TrafficLightSignals;
}

export interface TrafficLightResult {
  rating: TrafficLightRating;
  score: number; // 0-100, INVERTIERT: grün hoch, rot niedrig
  reason: string;
}

function buildPrompt(input: TrafficLightInput): string {
  const s = input.signals;
  const hasWebsite = !!input.website;
  const signalLines = hasWebsite
    ? [
        `Design-Score: ${s.designScore ?? "?"}/100 (höher = moderner)`,
        `Alters-Einschätzung: ${s.ageEstimate ?? "?"}`,
        `SSL: ${s.hasSsl == null ? "?" : s.hasSsl ? "ja" : "nein"}`,
        `mobilfreundlich: ${s.isMobileFriendly == null ? "?" : s.isMobileFriendly ? "ja" : "nein"}`,
        `Technik: ${s.technology ?? "?"}`,
        `HTTP-Status: ${s.statusCode ?? "?"}`,
        `Seitentitel: ${s.pageTitle ?? "?"}`,
        `Probleme: ${[...s.issues, ...s.visualIssues].join(", ") || "keine erkannt"}`,
      ].join("\n")
    : "Es ist KEINE Website hinterlegt und es konnte keine gefunden werden.";

  const noWebsiteHint = hasWebsite
    ? input.screenshotBuffer
      ? "Nutze den beigefügten Screenshot als WICHTIGSTES Signal für das tatsächliche optische Alter der Seite."
      : "Es liegt kein Screenshot vor — beurteile anhand der genannten Signale."
    : "Entscheide ALLEIN anhand der Firmeninfos: wirkt die Firma aktiv → GRÜN (Chance auf Erstprojekt), liquidiert/inaktiv → ROT, unklar → ORANGE.";

  return `Du bewertest, wie ATTRAKTIV diese Firma als Lead für eine WEBDESIGN-AGENTUR ist.
WICHTIG: Du bewertest NICHT die Qualität der Website, sondern den VERKAUFS-BEDARF.
Die Logik ist bewusst INVERTIERT:

🟢 GRÜN (heißer Lead, score 67-100):
   - Die Website ist sicher sehr alt / veraltet und muss definitiv neu gemacht werden, ODER
   - Die Firma ist aktiv und hat GAR KEINE Website → klare Chance für ein Erstprojekt.

🟠 ORANGE (Mittelding, score 34-66):
   - Du bist unsicher, ODER die Website sieht okay/durchschnittlich aus. Bei Zweifel IMMER Orange.

🔴 ROT (uninteressant, score 0-33):
   - Die Website sieht richtig gut / modern aus → KEIN Bedarf, ODER
   - Die Firma ist liquidiert / aufgelöst / in Insolvenz / inaktiv → kein Kunde mehr.

Erkenne Inaktivität/Liquidation an Hinweisen in der Beschreibung
(z.B. "i.L.", "in Liquidation", "aufgelöst", "Insolvenz", "gelöscht", "Betrieb eingestellt")
und am Website-Zustand (HTTP-Status ungleich 200, geparkte Domain, Fehlerseite).

Firma: ${input.companyName}
Website: ${input.website ?? "KEINE"}
Beschreibung/Status: ${input.description?.slice(0, 1500) ?? "—"}
${signalLines}

${noWebsiteHint}

Antworte als JSON in EXAKT diesem Schema (keine Markdown-Codeblocks):
{
  "rating": "green" | "amber" | "red",
  "score": <ganze Zahl 0-100, grün hoch, rot niedrig>,
  "reason": "<kurze deutsche Begründung, 1-2 Sätze>"
}`;
}

function parseJson(text: string): TrafficLightResult | null {
  let t = text.trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  try {
    const o = JSON.parse(t) as Record<string, unknown>;
    const r = String(o.rating ?? "").toLowerCase();
    const rating: TrafficLightRating =
      r.includes("green") || r.includes("grün") || r.includes("gruen")
        ? "green"
        : r.includes("red") || r.includes("rot")
          ? "red"
          : "amber"; // Fallback bei Unsicherheit → Orange
    const score = Math.max(0, Math.min(100, Math.round(Number(o.score) || 0)));
    const reason = typeof o.reason === "string" ? o.reason.slice(0, 500) : "";
    return { rating, score, reason };
  } catch {
    return null;
  }
}

/**
 * KI-Ampel-Bewertung eines Webdesign-Leads. Nutzt den Screenshot (Vision), falls
 * vorhanden, sonst einen reinen Text-Call (z.B. Leads ohne Website). Gibt bei
 * Fehler/Parse-Problem `null` zurück — der Aufrufer überspringt dann das Schreiben,
 * der Enrichment-Lauf bricht NICHT ab.
 */
export async function evaluateTrafficLight(
  input: TrafficLightInput,
): Promise<TrafficLightResult | null> {
  const prompt = buildPrompt(input);
  const base64 = input.screenshotBuffer ? input.screenshotBuffer.toString("base64") : null;

  if (process.env.OPENAI_API_KEY) {
    try {
      const openai = new OpenAI();
      const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = base64
        ? [
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } },
            { type: "text", text: prompt },
          ]
        : [{ type: "text", text: prompt }];
      const res = await openai.chat.completions.create({
        model: MODEL_OPENAI,
        max_tokens: 300,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content }],
      });
      return parseJson(res.choices[0]?.message?.content ?? "");
    } catch {
      return null;
    }
  }

  try {
    const client = new Anthropic();
    const content: Anthropic.MessageParam["content"] = base64
      ? [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
          { type: "text", text: prompt },
        ]
      : [{ type: "text", text: prompt }];
    const res = await client.messages.create({
      model: MODEL_ANTHROPIC,
      max_tokens: 300,
      temperature: 0,
      messages: [{ role: "user", content }],
    });
    const block = res.content.find((b) => b.type === "text");
    return parseJson(block?.type === "text" ? block.text : "");
  } catch {
    return null;
  }
}
