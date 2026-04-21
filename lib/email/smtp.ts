import nodemailer from "nodemailer";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
}

const CONNECTION_TIMEOUT_MS = 8_000;
const SOCKET_TIMEOUT_MS = 15_000;

function createTransport(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.username,
      pass: config.password,
    },
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
    greetingTimeout: CONNECTION_TIMEOUT_MS,
  });
}

/** Übersetzt rohe nodemailer-/Socket-Fehler in sprechende Meldungen mit
 *  Mittwald-Hinweisen. Raw-Message bleibt im Default-Zweig erhalten, damit
 *  andere Provider nicht missverständliche Meldungen bekommen. */
function mapSmtpError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: unknown } | null)?.code;
  const codeStr = typeof code === "string" ? code : "";
  const hay = `${codeStr} ${msg}`;

  if (/invalid login|535|authentication failed|auth.*(failed|denied)/i.test(hay)) {
    return "Anmeldung fehlgeschlagen. Bei Mittwald muss der Username die Postfach-Nummer im Format pXXXXXXpX sein (z. B. p123456p1) — oder die E-Mail-Adresse, wenn ein Login-Alias gesetzt wurde. Passwort prüfen.";
  }
  if (/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|EAI_AGAIN|ENETUNREACH/i.test(hay)) {
    return "Server nicht erreichbar. Host und Port prüfen (Mittwald: mail.agenturserver.de, Port 587 für STARTTLS oder 465 für SSL/TLS).";
  }
  if (/ETIMEDOUT|greeting never received|connection timeout|timed out/i.test(hay)) {
    return "Zeitüberschreitung beim Verbinden. Möglicherweise blockiert eine Firewall den Port, oder der Server ist temporär nicht erreichbar.";
  }
  if (/cert|self[- ]?signed|tls|ssl/i.test(hay) && !/(STARTTLS|ESSL)/.test(codeStr)) {
    return "TLS-Zertifikatsfehler. Bitte mail.agenturserver.de als Host verwenden (kein IP / kein Alias).";
  }
  return `${msg} — Hinweis: Bei Mittwald-Postfächern muss der Username die P-Nummer (pXXXXXXpX) sein.`;
}

/** Verifiziert AUTH + Connection gegen den SMTP-Server. */
export async function verifySmtp(
  config: SmtpConfig,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const transporter = createTransport(config);
    await transporter.verify();
    transporter.close();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mapSmtpError(e) };
  }
}

/** Sendet eine E-Mail. */
export async function sendEmail(
  config: SmtpConfig,
  mail: { to: string; subject: string; body: string },
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  try {
    const transporter = createTransport(config);
    const info = await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: mail.to,
      subject: mail.subject,
      text: mail.body,
    });
    transporter.close();
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    return { ok: false, error: mapSmtpError(e) };
  }
}
