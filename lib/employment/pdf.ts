// PDF-Erzeugung & Storage für Arbeitsverträge + Personalfragebogen.
// Nutzt denselben privaten Bucket `contracts` wie Kundenverträge, jedoch unter
// dem Präfix employment/<id>/. Chromium-Rendering kommt aus lib/contracts/pdf.ts.

import { createServiceClient } from "@/lib/supabase/server";
import { renderHtmlToPdf } from "@/lib/contracts/pdf";
import { renderEmploymentContractHtml, type EmploymentRenderInput } from "./template";
import { renderPersonalfragebogenHtml, type PersonalfragebogenRenderInput } from "./questionnaire-template";

const BUCKET = "contracts";

/** Hinterlegte swipeflow-Unterschrift fürs Vertrags-PDF (oder null). */
export { loadProviderSignatureForPdf, getContractFileSignedUrl, downloadContractFile } from "@/lib/contracts/pdf";

/** Rendert den Arbeitsvertrag (pdf-Modus) zu einem A4-PDF. */
export async function renderEmploymentPdf(input: EmploymentRenderInput): Promise<Buffer> {
  return renderHtmlToPdf(renderEmploymentContractHtml({ ...input, mode: "pdf" }));
}

/** Rendert den ausgefüllten Personalfragebogen zu einem A4-PDF. */
export async function renderQuestionnairePdf(input: PersonalfragebogenRenderInput): Promise<Buffer> {
  return renderHtmlToPdf(renderPersonalfragebogenHtml(input));
}

/** Lädt das Signatur-PNG (data:URL → Buffer) nach employment/<id>/signature.png. */
export async function uploadEmploymentSignaturePng(
  contractId: string,
  dataUrl: string,
): Promise<{ path: string } | { error: string }> {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!match) return { error: "Ungültiges Signatur-Format (PNG erwartet)." };
  const buffer = Buffer.from(match[1], "base64");
  const db = createServiceClient();
  const path = `employment/${contractId}/signature.png`;
  const { error } = await db.storage.from(BUCKET).upload(path, buffer, {
    contentType: "image/png",
    upsert: true,
    cacheControl: "0",
  });
  if (error) return { error: error.message };
  return { path };
}

/** Lädt das Vertrags-PDF nach employment/<id>/vertrag.pdf. */
export async function uploadEmploymentPdf(
  contractId: string,
  buffer: Buffer,
): Promise<{ path: string } | { error: string }> {
  const db = createServiceClient();
  const path = `employment/${contractId}/vertrag.pdf`;
  const { error } = await db.storage.from(BUCKET).upload(path, buffer, {
    contentType: "application/pdf",
    upsert: true,
    cacheControl: "0",
  });
  if (error) return { error: error.message };
  return { path };
}

/** Lädt das Personalfragebogen-PDF nach employment/<id>/personalfragebogen.pdf. */
export async function uploadQuestionnairePdf(
  contractId: string,
  buffer: Buffer,
): Promise<{ path: string } | { error: string }> {
  const db = createServiceClient();
  const path = `employment/${contractId}/personalfragebogen.pdf`;
  const { error } = await db.storage.from(BUCKET).upload(path, buffer, {
    contentType: "application/pdf",
    upsert: true,
    cacheControl: "0",
  });
  if (error) return { error: error.message };
  return { path };
}
