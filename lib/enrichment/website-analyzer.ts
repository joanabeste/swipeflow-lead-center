import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { WebdevScoringConfig } from "@/lib/types";
import { DEFAULT_WEBDEV_SCORING } from "@/lib/types";

export interface WebsiteAnalysis {
  hasSsl: boolean;
  isMobileFriendly: boolean;
  loadTimeMs: number;
  technology: string | null;
  designEstimate: "veraltet" | "durchschnittlich" | "modern";
  issues: string[];
}

const TECH_PATTERNS: [RegExp, string][] = [
  [/wp-content|wordpress/i, "WordPress"],
  [/wix\.com|wixsite/i, "Wix"],
  [/shopify/i, "Shopify"],
  [/squarespace/i, "Squarespace"],
  [/jimdo/i, "Jimdo"],
  [/typo3/i, "TYPO3"],
  [/joomla/i, "Joomla"],
  [/drupal/i, "Drupal"],
  [/webflow/i, "Webflow"],
  [/next/i, "Next.js"],
  [/nuxt/i, "Nuxt"],
  [/gatsby/i, "Gatsby"],
  [/elementor/i, "WordPress (Elementor)"],
  [/divi/i, "WordPress (Divi)"],
  [/ionos|1und1/i, "IONOS Baukasten"],
  [/strato/i, "Strato Baukasten"],
];

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

/** Baut den Design-Prompt je nach Strenge-Level */
function buildDesignPrompt(
  scoring: WebdevScoringConfig,
  htmlSnippet: string,
  cssInfo: string,
): string {
  const strictnessGuide: Record<WebdevScoringConfig["strictness"], string> = {
    lax: "Bewerte großzügig — nur bei offensichtlich veralteten Seiten (Tabellen-Layout, Flash, <font>-Tags, keine CSS-Dateien) 'veraltet' vergeben. Solide 2015er-Seiten sind 'durchschnittlich'. 'modern' für zeitgemäße Seiten.",
    normal: "Bewerte ausgewogen. Kriterien: Modernes CSS (Flexbox/Grid), Whitespace, Typografie, Layout. Altes Design = 'veraltet'. Solide Standards = 'durchschnittlich'. Zeitgemäß = 'modern'.",
    strict: "Bewerte streng — heutige Designstandards anlegen. Fehlende Flexbox/Grid, veraltete Typografie, wenig Whitespace, altmodische Farben → 'veraltet'. Nur wirklich zeitgemäß = 'modern'. Der Großteil des deutschen Mittelstands ist 'veraltet'.",
  };

  const parts: string[] = [
    "Bewerte das Webdesign dieser Seite. Antwort NUR mit einem Wort: \"veraltet\", \"durchschnittlich\" oder \"modern\".",
    strictnessGuide[scoring.strictness],
  ];
  if (scoring.design_focus?.trim()) {
    parts.push(`Besonderer Fokus: ${scoring.design_focus.trim()}`);
  }
  parts.push(`HTML-Snippet:\n${htmlSnippet}`);
  parts.push(`CSS-Links:\n${cssInfo || "—"}`);
  return parts.join("\n\n");
}

/** Analysiert die technische Qualität einer Website */
export async function analyzeWebsite(
  websiteOrDomain: string,
  scoring: WebdevScoringConfig = DEFAULT_WEBDEV_SCORING,
): Promise<WebsiteAnalysis> {
  const domain = websiteOrDomain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

  // 1. SSL-Check + Ladezeit + HTML holen
  let hasSsl = false;
  let loadTimeMs = 0;
  let html = "";

  const httpsUrl = `https://${domain}`;
  const httpUrl = `http://${domain}`;

  try {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(httpsUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeout);
    loadTimeMs = Date.now() - start;

    if (res.ok) {
      hasSsl = true;
      html = await res.text();
    }
  } catch {
    // HTTPS fehlgeschlagen — versuche HTTP
    try {
      const start = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const res = await fetch(httpUrl, {
        headers: { "User-Agent": USER_AGENT },
        signal: controller.signal,
        redirect: "follow",
      });

      clearTimeout(timeout);
      loadTimeMs = Date.now() - start;

      if (res.ok) {
        html = await res.text();
        hasSsl = res.url.startsWith("https://");
      }
    } catch {
      return {
        hasSsl: false,
        isMobileFriendly: false,
        loadTimeMs: 0,
        technology: null,
        designEstimate: "veraltet",
        issues: ["Website nicht erreichbar"],
      };
    }
  }

  // 2. Mobile-Check
  const hasViewport = /<meta[^>]*name=["']viewport["'][^>]*>/i.test(html);
  const hasResponsive = /media\s*\(\s*max-width|@media|responsive/i.test(html);
  const isMobileFriendly = hasViewport || hasResponsive;

  // 3. Technologie-Erkennung
  let technology: string | null = null;
  for (const [pattern, name] of TECH_PATTERNS) {
    if (pattern.test(html)) {
      technology = name;
      break;
    }
  }

  // 4. Issues sammeln — je nach aktivierten Checks
  const issues: string[] = [];

  if (scoring.check_ssl && !hasSsl) issues.push("Kein SSL-Zertifikat");
  if (scoring.check_responsive && !isMobileFriendly) issues.push("Nicht mobilfreundlich");

  if (loadTimeMs > scoring.very_slow_load_threshold_ms) {
    issues.push(`Langsame Ladezeit (>${Math.round(scoring.very_slow_load_threshold_ms / 1000)}s)`);
  } else if (loadTimeMs > scoring.slow_load_threshold_ms) {
    issues.push(`Mäßige Ladezeit (>${Math.round(scoring.slow_load_threshold_ms / 1000)}s)`);
  }

  if (scoring.check_meta_tags) {
    if (!/<meta[^>]*name=["']description["'][^>]*>/i.test(html)) issues.push("Keine Meta-Description");
    if (!/<title[^>]*>[^<]+<\/title>/i.test(html)) issues.push("Kein Seiten-Titel");
  }

  if (scoring.check_alt_tags) {
    if (/<img[^>]*(?!alt=)[^>]*>/i.test(html)) issues.push("Bilder ohne Alt-Text");
  }

  if (scoring.check_outdated_html) {
    if (/jquery-1\.|jquery\.min\.js.*1\./i.test(html)) issues.push("Veraltetes jQuery");
    if (/flash|swfobject/i.test(html)) issues.push("Flash-Inhalte");
    if (/<table[^>]*>[\s\S]*<table/i.test(html)) issues.push("Tabellen-basiertes Layout");
    if (/<font[\s>]/i.test(html)) issues.push("Veraltete HTML-Tags (<font>)");
    if (/<center[\s>]/i.test(html)) issues.push("Veraltete HTML-Tags (<center>)");
    if (/<!DOCTYPE html/i.test(html) === false) issues.push("Kein HTML5 DOCTYPE");
  }

  // 5. Design-Einschätzung via LLM (abhängig von Strenge + Fokus)
  let designEstimate: WebsiteAnalysis["designEstimate"] = "durchschnittlich";

  const designSnippet = html.slice(0, 3000);
  const cssInfo = (html.match(/<link[^>]*stylesheet[^>]*>/gi) ?? []).join("\n");
  const designPrompt = buildDesignPrompt(scoring, designSnippet, cssInfo);

  try {
    if (process.env.OPENAI_API_KEY) {
      const openai = new OpenAI();
      const res = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        max_tokens: 10,
        temperature: 0,
        messages: [{ role: "user", content: designPrompt }],
      });
      const answer = res.choices[0]?.message?.content?.toLowerCase().trim() ?? "";
      if (answer.includes("veraltet")) designEstimate = "veraltet";
      else if (answer.includes("modern")) designEstimate = "modern";
    } else {
      const client = new Anthropic();
      const res = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 10,
        temperature: 0,
        messages: [{ role: "user", content: designPrompt }],
      });
      const block = res.content.find((b) => b.type === "text");
      const answer = (block?.type === "text" ? block.text : "").toLowerCase().trim();
      if (answer.includes("veraltet")) designEstimate = "veraltet";
      else if (answer.includes("modern")) designEstimate = "modern";
    }
  } catch {
    // Design-Check fehlgeschlagen — basierend auf Issues schätzen
    if (issues.length >= 4) designEstimate = "veraltet";
  }

  if (designEstimate === "veraltet" && !issues.includes("Veraltetes Design")) {
    issues.push("Veraltetes Design");
  }

  return { hasSsl, isMobileFriendly, loadTimeMs, technology, designEstimate, issues };
}
