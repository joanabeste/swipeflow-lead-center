// Zentraler E-Mail-Versand für Verträge — nicht das Pro-Nutzer-SMTP, sondern
// eine feste swipeflow-Absenderadresse aus Env-Variablen.

import { sendEmail, type SmtpConfig, type EmailAttachment } from "./smtp";

export function getCentralSmtpConfig(): SmtpConfig {
  const host = process.env.CENTRAL_SMTP_HOST;
  const user = process.env.CENTRAL_SMTP_USER;
  const password = process.env.CENTRAL_SMTP_PASSWORD;
  const fromEmail = process.env.CENTRAL_SMTP_FROM_EMAIL;
  if (!host || !user || !password || !fromEmail) {
    throw new Error(
      "Zentrales SMTP nicht konfiguriert. CENTRAL_SMTP_HOST/USER/PASSWORD/FROM_EMAIL setzen.",
    );
  }
  return {
    host,
    port: Number(process.env.CENTRAL_SMTP_PORT ?? 587),
    secure: process.env.CENTRAL_SMTP_SECURE === "true",
    username: user,
    password,
    fromName: process.env.CENTRAL_SMTP_FROM_NAME ?? "swipeflow GmbH",
    fromEmail,
  };
}

/** Baut den absoluten, öffentlichen Kunden-Vertragslink (vertrag.swipeflow.de).
 *  Fällt auf APP_BASE_URL zurück, falls keine eigene Public-Domain gesetzt ist. */
export function buildContractLink(token: string): string {
  const base = (process.env.CONTRACT_PUBLIC_BASE_URL ?? process.env.APP_BASE_URL ?? "")
    .replace(/\/+$/, "");
  return `${base}/vertrag/${token}`;
}

/** Versendet den Vertragslink an den Kunden über die zentrale Adresse. */
export async function sendContractLinkEmail(opts: {
  to: string;
  customerName: string;
  link: string;
  expiresAt: Date;
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const config = getCentralSmtpConfig();
  const ablauf = opts.expiresAt.toLocaleDateString("de-DE");
  const body = [
    `Guten Tag,`,
    ``,
    `anbei erhalten Sie Ihren Vertrag von der swipeflow GmbH.`,
    `Bitte öffnen Sie den folgenden Link, prüfen Sie den Vertrag in Ruhe,`,
    `ergänzen Sie Ihre Rechnungs- und Zahlungsdaten und unterschreiben Sie direkt online:`,
    ``,
    opts.link,
    ``,
    `Der Link ist bis zum ${ablauf} gültig.`,
    ``,
    `Bei Fragen erreichen Sie uns jederzeit.`,
    ``,
    `Mit freundlichen Grüßen`,
    `swipeflow GmbH`,
  ].join("\n");

  return sendEmail(config, {
    to: opts.to,
    subject: "Ihr Vertrag mit der swipeflow GmbH",
    body,
  });
}

/** Bestätigung an den Kunden nach erfolgter Unterschrift (signiertes PDF als Anhang, falls vorhanden). */
export async function sendContractSignedCustomerEmail(opts: {
  to: string;
  customerName: string;
  pdf?: Buffer | null;
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const config = getCentralSmtpConfig();
  const body = [
    `Guten Tag,`,
    ``,
    `vielen Dank — Ihr Vertrag mit der swipeflow GmbH wurde erfolgreich unterschrieben.`,
    opts.pdf ? `Eine Kopie des unterschriebenen Vertrags finden Sie im Anhang.` : `Eine Kopie senden wir Ihnen auf Wunsch gerne zu.`,
    ``,
    `Bei Fragen erreichen Sie uns jederzeit.`,
    ``,
    `Mit freundlichen Grüßen`,
    `swipeflow GmbH`,
  ].join("\n");

  const attachments: EmailAttachment[] | undefined = opts.pdf
    ? [{ filename: "Vertrag-swipeflow.pdf", content: opts.pdf, contentType: "application/pdf" }]
    : undefined;

  return sendEmail(config, {
    to: opts.to,
    subject: "Ihr unterschriebener Vertrag — swipeflow GmbH",
    body,
    attachments,
  });
}

/** Interne Benachrichtigung an swipeflow, dass ein Vertrag unterschrieben wurde. */
export async function sendContractSignedNotifyEmail(opts: {
  customerName: string;
  adminUrl: string;
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const config = getCentralSmtpConfig();
  const to = process.env.CONTRACTS_NOTIFY_EMAIL || config.fromEmail;
  const body = [
    `Ein Vertrag wurde soeben unterschrieben.`,
    ``,
    `Kunde: ${opts.customerName || "—"}`,
    `Im Backend ansehen: ${opts.adminUrl}`,
  ].join("\n");

  return sendEmail(config, {
    to,
    subject: `Vertrag unterschrieben: ${opts.customerName || "Kunde"}`,
    body,
  });
}

/** Baut die absolute Admin-URL zur Vertrags-Detailseite. */
export function buildContractAdminUrl(contractId: string): string {
  const base = (process.env.APP_BASE_URL ?? "").replace(/\/+$/, "");
  return `${base}/vertraege/${contractId}`;
}

// ─── Arbeitsverträge (interne Mitarbeiter) ──────────────────────────────────

/** Baut den öffentlichen Arbeitsvertrags-Link (gleiche Public-Domain wie Kundenverträge). */
export function buildEmploymentLink(token: string): string {
  const base = (process.env.CONTRACT_PUBLIC_BASE_URL ?? process.env.APP_BASE_URL ?? "")
    .replace(/\/+$/, "");
  return `${base}/arbeitsvertrag/${token}`;
}

/** Baut die absolute Admin-URL zur Arbeitsvertrags-Detailseite. */
export function buildEmploymentAdminUrl(contractId: string): string {
  const base = (process.env.APP_BASE_URL ?? "").replace(/\/+$/, "");
  return `${base}/vertraege/arbeit/${contractId}`;
}

/** Versendet den Arbeitsvertrags-Link an den künftigen Mitarbeiter. */
export async function sendEmploymentLinkEmail(opts: {
  to: string;
  employeeName: string;
  link: string;
  expiresAt: Date;
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const config = getCentralSmtpConfig();
  const ablauf = opts.expiresAt.toLocaleDateString("de-DE");
  const body = [
    `Hallo ${opts.employeeName || ""}`.trim() + ",",
    ``,
    `anbei erhältst du deinen Arbeitsvertrag mit der Swipeflow GmbH.`,
    `Bitte öffne den folgenden Link, prüfe den Vertrag in Ruhe und unterschreibe direkt online.`,
    `Im Anschluss kannst du den Personalfragebogen für die Lohnabrechnung ausfüllen:`,
    ``,
    opts.link,
    ``,
    `Der Link ist bis zum ${ablauf} gültig.`,
    ``,
    `Bei Fragen melde dich jederzeit.`,
    ``,
    `Viele Grüße`,
    `Swipeflow GmbH`,
  ].join("\n");

  return sendEmail(config, {
    to: opts.to,
    subject: "Dein Arbeitsvertrag mit der Swipeflow GmbH",
    body,
  });
}

/** Interne Benachrichtigung, dass ein Arbeitsvertrag unterschrieben wurde. */
export async function sendEmploymentSignedNotifyEmail(opts: {
  employeeName: string;
  adminUrl: string;
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const config = getCentralSmtpConfig();
  const to = process.env.CONTRACTS_NOTIFY_EMAIL || config.fromEmail;
  const body = [
    `Ein Arbeitsvertrag wurde soeben unterschrieben.`,
    ``,
    `Mitarbeiter: ${opts.employeeName || "—"}`,
    `Im Backend ansehen: ${opts.adminUrl}`,
  ].join("\n");

  return sendEmail(config, {
    to,
    subject: `Arbeitsvertrag unterschrieben: ${opts.employeeName || "Mitarbeiter"}`,
    body,
  });
}

/** Interne Benachrichtigung, dass der Personalfragebogen ausgefüllt wurde. */
export async function sendQuestionnaireSubmittedNotifyEmail(opts: {
  employeeName: string;
  adminUrl: string;
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const config = getCentralSmtpConfig();
  const to = process.env.CONTRACTS_NOTIFY_EMAIL || config.fromEmail;
  const body = [
    `Der Personalfragebogen wurde ausgefüllt.`,
    ``,
    `Mitarbeiter: ${opts.employeeName || "—"}`,
    `PDF im Backend herunterladen: ${opts.adminUrl}`,
  ].join("\n");

  return sendEmail(config, {
    to,
    subject: `Personalfragebogen ausgefüllt: ${opts.employeeName || "Mitarbeiter"}`,
    body,
  });
}

// ─── Social-Media-Freigabe ──────────────────────────────────────────────────

/** Versendet den dauerhaften Freigabelink für Social-Media-Inhalte an den Kunden. */
export async function sendShareLinkEmail(opts: {
  to: string;
  customerName: string;
  link: string;
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const config = getCentralSmtpConfig();
  const body = [
    `Guten Tag,`,
    ``,
    `wir haben neue Social-Media-Inhalte für Sie vorbereitet.`,
    `Über den folgenden Link können Sie die geplanten Beiträge in Ruhe ansehen,`,
    `kommentieren oder direkt freigeben:`,
    ``,
    opts.link,
    ``,
    `Der Link bleibt dauerhaft gültig — Sie finden dort immer Ihre aktuellen Beiträge.`,
    ``,
    `Bei Fragen erreichen Sie uns jederzeit.`,
    ``,
    `Mit freundlichen Grüßen`,
    `swipeflow GmbH`,
  ].join("\n");

  return sendEmail(config, {
    to: opts.to,
    subject: "Ihre Social-Media-Inhalte zur Freigabe — swipeflow GmbH",
    body,
  });
}

/** Interne Benachrichtigung ans Team, dass ein Kunde einen Post freigegeben oder
 *  eine Änderung angefordert hat. */
export async function sendPostFeedbackNotifyEmail(opts: {
  customerName: string;
  action: "approved" | "changes_requested";
  postTitle: string;
  comment?: string;
  adminUrl: string;
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const config = getCentralSmtpConfig();
  const to = process.env.CONTENT_NOTIFY_EMAIL || process.env.CONTRACTS_NOTIFY_EMAIL || config.fromEmail;
  const actionLabel = opts.action === "approved" ? "freigegeben" : "eine Änderung angefordert";
  const body = [
    `Ein Kunde hat einen Social-Media-Beitrag ${actionLabel}.`,
    ``,
    `Kunde: ${opts.customerName || "—"}`,
    `Beitrag: ${opts.postTitle || "—"}`,
    ...(opts.comment ? [``, `Kommentar:`, opts.comment] : []),
    ``,
    `Im Backend ansehen: ${opts.adminUrl}`,
  ].join("\n");

  return sendEmail(config, {
    to,
    subject:
      opts.action === "approved"
        ? `Beitrag freigegeben: ${opts.customerName || "Kunde"}`
        : `Änderung angefordert: ${opts.customerName || "Kunde"}`,
    body,
  });
}

/** Baut die absolute Admin-URL zum Social-Media-Board eines Projekts. */
export function buildSocialBoardAdminUrl(projectId: string): string {
  const base = (process.env.APP_BASE_URL ?? "").replace(/\/+$/, "");
  return `${base}/fulfillment/projekte/${projectId}?tab=social`;
}
