import chromium from "@sparticuz/chromium-min";
import { chromium as pwChromium } from "playwright-core";
import { createServiceClient } from "@/lib/supabase/server";

const BUCKET = "website-screenshots";

// Chromium-Binary, das @sparticuz/chromium-min zur Runtime lädt (Vercel-kompatibel,
// hält die Function unter dem 250 MB Bundle-Limit). Version muss zur installierten
// @sparticuz/chromium-min Version passen.
const CHROMIUM_PACK_URL =
  process.env.CHROMIUM_PACK_URL ??
  "https://github.com/Sparticuz/chromium/releases/download/v148.0.0/chromium-v148.0.0-pack.x64.tar";

const VIEWPORT = { width: 1280, height: 800 };

export interface ScreenshotResult {
  buffer: Buffer;
  contentType: "image/jpeg";
}

/**
 * Macht einen JPEG-Screenshot der Above-the-Fold-View einer URL via Headless-Chromium.
 * Wirft bei harten Fehlern (Browser-Start, kompletter Navigation-Fail).
 *
 * Lokale Entwicklung auf macOS: PLAYWRIGHT_LOCAL_CHROME=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome setzen.
 */
export async function captureWebsiteScreenshot(rawUrl: string): Promise<ScreenshotResult> {
  const url = normalizeUrl(rawUrl);
  const localChrome = process.env.PLAYWRIGHT_LOCAL_CHROME;

  const executablePath = localChrome
    ? localChrome
    : await chromium.executablePath(CHROMIUM_PACK_URL);

  const browser = await pwChromium.launch({
    args: localChrome ? [] : chromium.args,
    executablePath,
    headless: true,
  });

  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      locale: "de-DE",
      extraHTTPHeaders: { "Accept-Language": "de-DE,de;q=0.9,en;q=0.8" },
    });
    const page = await context.newPage();

    // networkidle ist für viele Seiten zu strikt — wir akzeptieren auch domcontentloaded.
    // Bei Timeout fahren wir trotzdem fort: oft ist die Seite visuell schon fertig.
    await page
      .goto(url, { waitUntil: "domcontentloaded", timeout: 12_000 })
      .catch(() => {});

    // Kurze Settle-Time, damit CSS-Animationen, LCP-Bild und Webfonts gerendert sind.
    await page.waitForTimeout(1500);

    const buffer = await page.screenshot({
      type: "jpeg",
      quality: 80,
      fullPage: false,
      clip: { x: 0, y: 0, ...VIEWPORT },
    });

    return { buffer: Buffer.from(buffer), contentType: "image/jpeg" };
  } finally {
    await browser.close().catch(() => {});
  }
}

function normalizeUrl(input: string): string {
  if (/^https?:\/\//i.test(input)) return input;
  const cleaned = input.replace(/^www\./i, "").replace(/\/.*$/, "");
  return `https://${cleaned}`;
}

/**
 * Lädt einen Screenshot in den `website-screenshots` Storage-Bucket.
 * Überschreibt einen vorhandenen Screenshot desselben Leads.
 * Gibt den Storage-Pfad zurück (signed URL wird zur Anzeige separat erzeugt).
 */
export async function uploadScreenshot(
  leadId: string,
  buffer: Buffer,
  contentType: string,
): Promise<{ path: string } | { error: string }> {
  const db = createServiceClient();
  const path = `${leadId}.jpg`;
  const { error } = await db.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: true,
    cacheControl: "3600",
  });
  if (error) return { error: error.message };
  return { path };
}

/**
 * Erzeugt eine signed URL für die UI-Anzeige eines gespeicherten Screenshots.
 * Lifetime Default: 1 Stunde.
 */
export async function getScreenshotSignedUrl(
  path: string,
  expiresInSec = 3600,
): Promise<string | null> {
  const db = createServiceClient();
  const { data, error } = await db.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSec);
  if (error || !data) return null;
  return data.signedUrl;
}
