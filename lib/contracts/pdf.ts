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
  const html = renderContractHtml({ ...input, mode: "pdf" });
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
