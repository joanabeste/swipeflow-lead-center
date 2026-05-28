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

/** Baut den absoluten Vertragslink aus APP_BASE_URL + Token. */
export function buildContractLink(token: string): string {
  const base = (process.env.APP_BASE_URL ?? "").replace(/\/+$/, "");
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
