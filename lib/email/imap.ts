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
  const err = e as Record<string, unknown> | null;
  const baseMsg = e instanceof Error ? e.message : String(e);
  const response = typeof err?.response === "string" ? (err.response as string) : "";
  const responseText = typeof err?.responseText === "string" ? (err.responseText as string) : "";
  const responseStatus = typeof err?.responseStatus === "string" ? (err.responseStatus as string) : "";
  const executedCommand = typeof err?.executedCommand === "string" ? (err.executedCommand as string) : "";
  const code = typeof err?.code === "string" ? (err.code as string) : "";
  const authFailed = err?.authenticationFailed === true;

  // imapflow legt bei "Command failed" das geparste Response-Objekt unter .response ab — TEXT-Attribute extrahieren.
  let parsedText = "";
  const resp = err?.response;
  if (resp && typeof resp === "object" && "attributes" in resp) {
    const attrs = (resp as { attributes?: Array<{ type?: string; value?: string }> }).attributes;
    parsedText = (attrs ?? []).filter((a) => a.type === "TEXT").map((a) => a.value ?? "").join(" ").trim();
  } else if (typeof resp === "string") {
    parsedText = resp;
  }

  const combined = [baseMsg, parsedText, response, responseText, responseStatus, executedCommand, code]
    .filter(Boolean).join(" | ");
  const hay = combined.toLowerCase();

  const authCommand = /^(login|authenticate)$/i.test(responseStatus);
  if (authFailed || authCommand || /authenticat|login|535|invalid credentials|authfailed|nologin/.test(hay)) {
    return `IMAP-Anmeldung fehlgeschlagen — Username/Passwort pruefen. Bei Mittwald: Postfach-Nummer (pXXXXXXpX) oder die volle E-Mail-Adresse als Username. (${combined})`;
  }
  if (/econnrefused|enotfound|ehostunreach|eai_again|dns/.test(hay)) {
    return `IMAP-Server nicht erreichbar — Host/Port pruefen (Mittwald: mail.agenturserver.de, Port 993 SSL). (${combined})`;
  }
  if (/etimedout|timed out|timeout/.test(hay)) {
    return `Zeitueberschreitung beim Verbinden — moeglicherweise blockiert eine Firewall. (${combined})`;
  }
  if (/cert|tls|ssl|self-signed|unable to verify/.test(hay)) {
    return `TLS-Zertifikatsfehler — korrekten Host-Namen verwenden (kein IP). (${combined})`;
  }
  // "Command failed" ohne weitere Info → meistens Auth-Problem oder unbekannter Folder.
  if (/command failed/.test(hay)) {
    return `IMAP-Befehl fehlgeschlagen (oft Auth- oder Folder-Problem). Details: ${combined || "keine"}`;
  }
  return combined || baseMsg;
}
