import chromium from "@sparticuz/chromium-min";
import { chromium as pwChromium } from "playwright-core";
import { createServiceClient } from "@/lib/supabase/server";
import { renderContractHtml, type ContractRenderInput } from "./template";

const BUCKET = "contracts";

/** Fester Pfad der hinterlegten swipeflow-Unterschrift im `contracts`-Bucket. */
export const PROVIDER_SIGNATURE_PATH = "company/provider-signature.png";

// Identisch zu lib/enrichment/screenshot.ts: Chromium-Binary, das
// @sparticuz/chromium-min zur Runtime lädt (Vercel-kompatibel).
const CHROMIUM_PACK_URL =
  process.env.CHROMIUM_PACK_URL ??
  "https://github.com/Sparticuz/chromium/releases/download/v148.0.0/chromium-v148.0.0-pack.x64.tar";

/**
 * Rendert den Vertrag (pdf-Modus) zu einem A4-PDF via Headless-Chromium.
 * Local-Dev: PLAYWRIGHT_LOCAL_CHROME auf den Chrome-Pfad setzen.
 */
export async function renderContractPdf(input: ContractRenderInput): Promise<Buffer> {
  return renderHtmlToPdf(renderContractHtml({ ...input, mode: "pdf" }));
}

/**
 * Rendert beliebiges HTML zu einem A4-PDF via Headless-Chromium und schneidet
 * eingebettete Unterschriften (`.sign-img img`) auf ihre Ink-Bounding-Box zu.
 * Geteilt von Kunden- (renderContractPdf) und Arbeitsverträgen / Personalfragebogen.
 * Local-Dev: PLAYWRIGHT_LOCAL_CHROME auf den Chrome-Pfad setzen.
 */
export async function renderHtmlToPdf(html: string): Promise<Buffer> {
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
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    // Signaturen auf ihre sichtbare Tinte (Ink-Bounding-Box) zuschneiden, damit
    // sie sauber über der Unterschriftslinie sitzen und nicht je nach Zeichen-
    // position im Pad schweben/die Linie kreuzen. Läuft im Browser-Kontext.
    await page.evaluate(async () => {
      const ALPHA = 12; // Alpha darunter = Hintergrund (transparente Pad-PNGs)
      const NEAR_WHITE = 246; // opake, fast-weiße Pixel = Hintergrund (hochgeladene PNGs)
      const imgs = Array.from(document.querySelectorAll<HTMLImageElement>(".sign-img img"));
      for (const img of imgs) {
        try {
          await img.decode();
          const w = img.naturalWidth;
          const h = img.naturalHeight;
          if (!w || !h) continue;
          const src = document.createElement("canvas");
          src.width = w;
          src.height = h;
          const sctx = src.getContext("2d");
          if (!sctx) continue;
          sctx.drawImage(img, 0, 0);
          const { data } = sctx.getImageData(0, 0, w, h);
          let minX = w;
          let minY = h;
          let maxX = -1;
          let maxY = -1;
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const i = (y * w + x) * 4;
              const a = data[i + 3];
              const isBg =
                a < ALPHA ||
                (a > 250 &&
                  data[i] > NEAR_WHITE &&
                  data[i + 1] > NEAR_WHITE &&
                  data[i + 2] > NEAR_WHITE);
              if (!isBg) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
          }
          if (maxX < minX || maxY < minY) continue; // leer → unverändert lassen
          const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.06);
          minX = Math.max(0, minX - pad);
          minY = Math.max(0, minY - pad);
          maxX = Math.min(w - 1, maxX + pad);
          maxY = Math.min(h - 1, maxY + pad);
          const cw = maxX - minX + 1;
          const ch = maxY - minY + 1;
          const out = document.createElement("canvas");
          out.width = cw;
          out.height = ch;
          out.getContext("2d")?.drawImage(src, minX, minY, cw, ch, 0, 0, cw, ch);
          img.src = out.toDataURL("image/png");
          await img.decode(); // neue Quelle vor page.pdf fertig laden
        } catch {
          /* Bild unverändert lassen */
        }
      }
    });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm", left: "20mm", right: "20mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => {});
  }
}

/** Lädt das fertige Vertrags-PDF in den privaten `contracts`-Bucket. */
export async function uploadContractPdf(
  contractId: string,
  buffer: Buffer,
): Promise<{ path: string } | { error: string }> {
  const db = createServiceClient();
  const path = `${contractId}/vertrag.pdf`;
  const { error } = await db.storage.from(BUCKET).upload(path, buffer, {
    contentType: "application/pdf",
    upsert: true,
    cacheControl: "0",
  });
  if (error) return { error: error.message };
  return { path };
}

/** Lädt das Signatur-PNG (data:URL → Buffer) in den `contracts`-Bucket. */
export async function uploadSignaturePng(
  contractId: string,
  dataUrl: string,
): Promise<{ path: string } | { error: string }> {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!match) return { error: "Ungültiges Signatur-Format (PNG erwartet)." };
  const buffer = Buffer.from(match[1], "base64");
  const db = createServiceClient();
  const path = `${contractId}/signature.png`;
  const { error } = await db.storage.from(BUCKET).upload(path, buffer, {
    contentType: "image/png",
    upsert: true,
    cacheControl: "0",
  });
  if (error) return { error: error.message };
  return { path };
}

/** Lädt die hinterlegte swipeflow-Unterschrift (data:URL → Buffer) auf festen Pfad. */
export async function uploadProviderSignaturePng(
  dataUrl: string,
): Promise<{ path: string } | { error: string }> {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!match) return { error: "Ungültiges Signatur-Format (PNG erwartet)." };
  const buffer = Buffer.from(match[1], "base64");
  const db = createServiceClient();
  const { error } = await db.storage.from(BUCKET).upload(PROVIDER_SIGNATURE_PATH, buffer, {
    contentType: "image/png",
    upsert: true,
    cacheControl: "0",
  });
  if (error) return { error: error.message };
  return { path: PROVIDER_SIGNATURE_PATH };
}

/** Erzeugt eine signed URL für ein Objekt im `contracts`-Bucket. Default 1 h. */
export async function getContractFileSignedUrl(
  path: string,
  expiresInSec = 3600,
): Promise<string | null> {
  const db = createServiceClient();
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, expiresInSec);
  if (error || !data) return null;
  return data.signedUrl;
}

/** Lädt ein Objekt aus dem `contracts`-Bucket als Buffer (z. B. Signatur fürs PDF). */
export async function downloadContractFile(path: string): Promise<Buffer | null> {
  const db = createServiceClient();
  const { data, error } = await db.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/** Lädt die hinterlegte swipeflow-Unterschrift als data:URL fürs PDF (oder null). */
export async function loadProviderSignatureForPdf(): Promise<{ dataUrl: string } | null> {
  const { loadProviderSignaturePath } = await import("./settings");
  const path = await loadProviderSignaturePath();
  if (!path) return null;
  const buf = await downloadContractFile(path);
  if (!buf) return null;
  return { dataUrl: `data:image/png;base64,${buf.toString("base64")}` };
}
