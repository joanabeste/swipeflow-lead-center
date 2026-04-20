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
    return {
      ok: false,
      error: e instanceof Error ? e.message : "SMTP-Verify fehlgeschlagen",
    };
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
    return {
      ok: false,
      error: e instanceof Error ? e.message : "E-Mail-Versand fehlgeschlagen",
    };
  }
}
