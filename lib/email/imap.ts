// IMAP-Client-Wrapper (imapflow). Server-only.
import { ImapFlow } from "imapflow";
import type { ImapConfig } from "./user-credentials";

const CONNECT_TIMEOUT_MS = 10_000;

export function createImapClient(config: ImapConfig): ImapFlow {
  return new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.username,
      pass: config.password,
    },
    logger: false,
    socketTimeout: 30_000,
    greetingTimeout: CONNECT_TIMEOUT_MS,
    connectionTimeout: CONNECT_TIMEOUT_MS,
  });
}

/** Test-Verbindung + Folder-Liste. */
export async function verifyImap(
  config: ImapConfig,
): Promise<{ ok: true; folders: string[] } | { ok: false; error: string }> {
  const client = createImapClient(config);
  try {
    await client.connect();
    const list = await client.list();
    const folders = list.map((f) => f.path);
    await client.logout();
    return { ok: true, folders };
  } catch (e) {
    try {
      await client.close();
    } catch {
      // ignore
    }
    return { ok: false, error: mapImapError(e) };
  }
}

export function mapImapError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const hay = msg.toLowerCase();
  if (/authenticat|login|535|invalid credentials/.test(hay)) {
    return "IMAP-Anmeldung fehlgeschlagen. Username/Passwort prüfen. Bei Mittwald: Postfach-Nummer (pXXXXXXpX) oder E-Mail-Adresse.";
  }
  if (/econnrefused|enotfound|ehostunreach|eai_again/.test(hay)) {
    return "IMAP-Server nicht erreichbar. Host/Port prüfen (Mittwald: mail.agenturserver.de, Port 993 SSL).";
  }
  if (/etimedout|timed out/.test(hay)) {
    return "Zeitüberschreitung beim Verbinden. Möglicherweise blockiert eine Firewall.";
  }
  if (/cert|tls|ssl/.test(hay)) {
    return "TLS-Zertifikatsfehler. Korrekten Host-Namen verwenden (kein IP).";
  }
  return msg;
}
