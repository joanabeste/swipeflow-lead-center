import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { WebdevScoringConfig } from "@/lib/types";
import { DEFAULT_WEBDEV_SCORING } from "@/lib/types";
import { captureWebsiteScreenshot, uploadScreenshot } from "./screenshot";

export interface WebsiteAnalysis {
  hasSsl: boolean;
  isMobileFriendly: boolean;
  loadTimeMs: number;
  technology: string | null;
  designEstimate: "veraltet" | "durchschnittlich" | "modern";
  designScore: number | null;          // 0-100, aus Vision oder geschaetzt
  visualIssues: string[];               // konkrete Vision-Findings
  issues: string[];
  screenshotPath: string | null;
  screenshotTakenAt: string | null;
  // Erweiterte Daten fuer Qualitaets-Beurteilung (passiv erfasst)
  statusCode: number | null;
  finalUrl: string | null;
  htmlSizeBytes: number;
  pageTitle: string | null;
  metaDescription: string | null;
  language: string | null;
  hasImpressum: boolean;
  hasPrivacy: boolean;
  hasContactForm: boolean;
  imageCount: number;
  internalLinkCount: number;
  externalLinkCount: number;
  socialLinks: {
    linkedin: string | null;
    xing: string | null;
    facebook: string | null;
    instagram: string | null;
    youtube: string | null;
  };
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

const VISION_MODEL_OPENAI = "gpt-4o";
const VISION_MODEL_ANTHROPIC = "claude-sonnet-4-20250514";

function buildVisualAnalysisPrompt(scoring: WebdevScoringConfig): string {
  const strictnessGuide: Record<WebdevScoringConfig["strictness"], string> = {
    lax: "Bewerte grosszuegig. Nur offensichtlich veraltete Designs (Optik vor 2010, alte Stockfotos, harte Farben, wenig Whitespace) bekommen unter 40 Punkten.",
    normal: "Bewerte ausgewogen anhand heutiger Webdesign-Standards.",
    strict: "Bewerte streng. Schlechte Typografie, gestauchte Layouts, wenig Whitespace, altmodische Farben/Bilder → unter 40 Punkten. Nur wirklich zeitgemaesse Seiten ueber 70.",
  };
  const focusLine = scoring.design_focus?.trim()
    ? `Besonderer Fokus: ${scoring.design_focus.trim()}`
    : "";

  return `Bewerte das Webdesign anhand dieses Screenshots.
${strictnessGuide[scoring.strictness]}
${focusLine}

Antworte als JSON in EXAKT diesem Schema (keine Markdown-Codeblocks):
{
  "score": <ganze Zahl 0-100>,
  "category": "veraltet" | "durchschnittlich" | "modern",
  "issues": ["kurzes Problem 1", "kurzes Problem 2", ...]
}

Kategorie-Mapping: 0-39 = veraltet, 40-69 = durchschnittlich, 70-100 = modern.
"issues" sind 0-5 konkrete visuelle Maengel (z.B. "wenig Whitespace", "altmodische Stockfotos", "schlechte Typografie", "schwacher Kontrast").`;
}

interface VisualResult {
  score: number;
  category: WebsiteAnalysis["designEstimate"];
  issues: string[];
}

function parseVisualJson(text: string): VisualResult | null {
  let t = text.trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  try {
    const o = JSON.parse(t) as Record<string, unknown>;
    const score = Math.max(0, Math.min(100, Math.round(Number(o.score) || 0)));
    const cat = String(o.category ?? "").toLowerCase();
    const category: WebsiteAnalysis["designEstimate"] =
      cat.includes("veraltet") ? "veraltet" :
      cat.includes("modern") ? "modern" : "durchschnittlich";
    const issues = Array.isArray(o.issues)
      ? o.issues.map((x) => String(x)).filter((s) => s.trim().length > 0).slice(0, 5)
      : [];
    return { score, category, issues };
  } catch {
    return null;
  }
}

async function evaluateDesignFromScreenshot(
  buffer: Buffer,
  scoring: WebdevScoringConfig,
): Promise<VisualResult | null> {
  const prompt = buildVisualAnalysisPrompt(scoring);
  const base64 = buffer.toString("base64");

  if (process.env.OPENAI_API_KEY) {
    try {
      const openai = new OpenAI();
      const res = await openai.chat.completions.create({
        model: VISION_MODEL_OPENAI,
        max_tokens: 300,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } },
              { type: "text", text: prompt },
            ],
          },
        ],
      });
      const answer = res.choices[0]?.message?.content ?? "";
      return parseVisualJson(answer);
    } catch {
      return null;
    }
  }

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: VISION_MODEL_ANTHROPIC,
      max_tokens: 300,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: base64 },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    });
    const block = res.content.find((b) => b.type === "text");
    const text = block?.type === "text" ? block.text : "";
    return parseVisualJson(text);
  } catch {
    return null;
  }
}

function extractMeta(html: string, name: string): string | null {
  const re = new RegExp(`<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']+)["']`, "i");
  const m = html.match(re) ?? html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["']${name}["']`, "i"));
  return m?.[1]?.trim() ?? null;
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m?.[1]?.trim() ?? null;
}

function extractLanguage(html: string): string | null {
  const m = html.match(/<html[^>]*lang=["']([a-zA-Z-]+)["']/i);
  return m?.[1]?.toLowerCase().split("-")[0] ?? null;
}

function detectSocialLinks(html: string): WebsiteAnalysis["socialLinks"] {
  const pick = (pattern: RegExp): string | null => {
    const m = html.match(pattern);
    return m?.[0] ?? null;
  };
  return {
    linkedin: pick(/https?:\/\/(?:[a-z]+\.)?linkedin\.com\/(?:company|in)\/[^"'\s<>)]+/i),
    xing: pick(/https?:\/\/(?:www\.)?xing\.com\/(?:companies|profile)\/[^"'\s<>)]+/i),
    facebook: pick(/https?:\/\/(?:www\.)?facebook\.com\/[^"'\s<>)]+/i),
    instagram: pick(/https?:\/\/(?:www\.)?instagram\.com\/[^"'\s<>)]+/i),
    youtube: pick(/https?:\/\/(?:www\.)?youtube\.com\/(?:channel|user|c|@)[^"'\s<>)]+/i),
  };
}

function detectImpressum(html: string): boolean {
  return /(impressum|imprint|legal[\s-]?notice)/i.test(html);
}
function detectPrivacy(html: string): boolean {
  return /(datenschutz|privacy[\s-]?policy)/i.test(html);
}
function detectContactForm(html: string): boolean {
  // Heuristik: ein <form> in dem das Wort "kontakt"/"contact" auftaucht ODER
  // ein input vom Typ email mit Submit-Button.
  if (/<form[^>]*>[\s\S]{0,2000}(kontakt|contact|message|nachricht)/i.test(html)) return true;
  if (/<input[^>]*type=["']email["']/i.test(html) && /<button[^>]*type=["']submit["']/i.test(html)) return true;
  return false;
}

function countLinks(html: string, baseDomain: string): { internal: number; external: number } {
  const links = html.match(/<a[^>]*href=["']([^"']+)["']/gi) ?? [];
  let internal = 0;
  let external = 0;
  for (const tag of links) {
    const m = tag.match(/href=["']([^"']+)["']/i);
    const href = m?.[1] ?? "";
    if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    if (href.startsWith("/") || (!href.includes("://") && !href.startsWith("//"))) {
      internal++;
    } else if (href.includes(baseDomain)) {
      internal++;
    } else {
      external++;
    }
  }
  return { internal, external };
}

function countImages(html: string): number {
  return (html.match(/<img[^>]*>/gi) ?? []).length;
}

export async function analyzeWebsite(
  websiteOrDomain: string,
  scoring: WebdevScoringConfig = DEFAULT_WEBDEV_SCORING,
  leadId?: string,
): Promise<WebsiteAnalysis> {
  const domain = websiteOrDomain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

  let hasSsl = false;
  let loadTimeMs = 0;
  let html = "";
  let statusCode: number | null = null;
  let finalUrl: string | null = null;

  const httpsUrl = `https://${domain}`;
  const httpUrl = `http://${domain}`;

  const tryFetch = async (url: string): Promise<boolean> => {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timeout);
      loadTimeMs = Date.now() - start;
      statusCode = res.status;
      finalUrl = res.url;
      if (res.ok) {
        html = await res.text();
        hasSsl = res.url.startsWith("https://");
        return true;
      }
    } catch {
      clearTimeout(timeout);
    }
    return false;
  };

  const okHttps = await tryFetch(httpsUrl);
  if (!okHttps) {
    const okHttp = await tryFetch(httpUrl);
    if (!okHttp) {
      return {
        hasSsl: false,
        isMobileFriendly: false,
        loadTimeMs: 0,
        technology: null,
        designEstimate: "veraltet",
        designScore: null,
        visualIssues: [],
        issues: ["Website nicht erreichbar"],
        screenshotPath: null,
        screenshotTakenAt: null,
        statusCode,
        finalUrl,
        htmlSizeBytes: 0,
        pageTitle: null,
        metaDescription: null,
        language: null,
        hasImpressum: false,
        hasPrivacy: false,
        hasContactForm: false,
        imageCount: 0,
        internalLinkCount: 0,
        externalLinkCount: 0,
        socialLinks: { linkedin: null, xing: null, facebook: null, instagram: null, youtube: null },
      };
    }
  }

  const htmlSizeBytes = Buffer.byteLength(html, "utf8");
  const hasViewport = /<meta[^>]*name=["']viewport["'][^>]*>/i.test(html);
  const hasResponsive = /media\s*\(\s*max-width|@media|responsive/i.test(html);
  const isMobileFriendly = hasViewport || hasResponsive;

  let technology: string | null = null;
  for (const [pattern, name] of TECH_PATTERNS) {
    if (pattern.test(html)) {
      technology = name;
      break;
    }
  }

  const pageTitle = extractTitle(html);
  const metaDescription = extractMeta(html, "description");
  const language = extractLanguage(html);
  const hasImpressum = detectImpressum(html);
  const hasPrivacy = detectPrivacy(html);
  const hasContactForm = detectContactForm(html);
  const imageCount = countImages(html);
  const linkCounts = countLinks(html, domain);
  const socialLinks = detectSocialLinks(html);

  const issues: string[] = [];
  if (scoring.check_ssl && !hasSsl) issues.push("Kein SSL-Zertifikat");
  if (scoring.check_responsive && !isMobileFriendly) issues.push("Nicht mobilfreundlich");

  if (loadTimeMs > scoring.very_slow_load_threshold_ms) {
    issues.push(`Langsame Ladezeit (>${Math.round(scoring.very_slow_load_threshold_ms / 1000)}s)`);
  } else if (loadTimeMs > scoring.slow_load_threshold_ms) {
    issues.push(`Maessige Ladezeit (>${Math.round(scoring.slow_load_threshold_ms / 1000)}s)`);
  }

  if (scoring.check_meta_tags) {
    if (!metaDescription) issues.push("Keine Meta-Description");
    if (!pageTitle) issues.push("Kein Seiten-Titel");
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

  let designEstimate: WebsiteAnalysis["designEstimate"] = "durchschnittlich";
  let designScore: number | null = null;
  let visualIssues: string[] = [];
  let screenshotPath: string | null = null;
  let screenshotTakenAt: string | null = null;

  // Vision ist jetzt der bevorzugte Pfad — gibt es einen leadId und ein bisschen
  // HTML, machen wir Screenshot + Vision-LLM. Fallback auf Text-Heuristik bleibt
  // unten erhalten, damit Webdev auch ohne Vision noch eine Einschaetzung hat.
  const visualMode = scoring.screenshot_visual_analysis && !!leadId;
  let visualSucceeded = false;

  if (visualMode) {
    try {
      const baseUrl = hasSsl ? httpsUrl : httpUrl;
      const { buffer, contentType } = await captureWebsiteScreenshot(baseUrl);
      const upload = await uploadScreenshot(leadId!, buffer, contentType);
      if ("path" in upload) {
        screenshotPath = upload.path;
        screenshotTakenAt = new Date().toISOString();
      }
      const visual = await evaluateDesignFromScreenshot(buffer, scoring);
      if (visual) {
        designEstimate = visual.category;
        designScore = visual.score;
        visualIssues = visual.issues;
        visualSucceeded = true;
      }
    } catch {
      // Fallback unten
    }
  }

  if (!visualSucceeded) {
    // Heuristischer Score aus Issues — passiv, damit Score auch ohne Vision verfuegbar ist.
    const baseScore = 75 - issues.length * 8;
    designScore = Math.max(15, Math.min(85, baseScore));
    if (issues.length >= 4) designEstimate = "veraltet";
    else if (issues.length <= 1) designEstimate = "modern";
  }

  if (designEstimate === "veraltet" && !issues.includes("Veraltetes Design")) {
    issues.push("Veraltetes Design");
  }

  return {
    hasSsl,
    isMobileFriendly,
    loadTimeMs,
    technology,
    designEstimate,
    designScore,
    visualIssues,
    issues,
    screenshotPath,
    screenshotTakenAt,
    statusCode,
    finalUrl,
    htmlSizeBytes,
    pageTitle,
    metaDescription,
    language,
    hasImpressum,
    hasPrivacy,
    hasContactForm,
    imageCount,
    internalLinkCount: linkCounts.internal,
    externalLinkCount: linkCounts.external,
    socialLinks,
  };
}
