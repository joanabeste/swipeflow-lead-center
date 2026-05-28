// SSRF-Schutz für serverseitige Fetches von benutzergelieferten URLs
// (URL-/Verzeichnis-Import, Website-Scraping). Blockt private/interne Ziele
// und folgt Redirects manuell mit Re-Validierung jedes Hops.
//
// Hinweis: Schützt vor versehentlichen/böswilligen internen Zielen. Eine
// Restlücke bleibt DNS-Rebinding (Auflösung hier ≠ Auflösung beim Connect);
// ein vollständiger Schutz bräuchte eine IP-Pinning-Dispatcher und ist für
// diesen serverseitigen Scraper überdimensioniert.

import { lookup } from "node:dns/promises";
import net from "node:net";

const MAX_REDIRECTS = 5;

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

function isPrivateIPv4(ip: string): boolean {
  const o = ip.split(".").map(Number);
  if (o.length !== 4 || o.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = o;
  if (a === 0 || a === 10 || a === 127) return true; // this-host, private, loopback
  if (a === 169 && b === 254) return true; // link-local (inkl. 169.254.169.254 Metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a >= 224) return true; // Multicast 224/4 + reserviert 240/4
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const addr = ip.toLowerCase();
  if (addr === "::1" || addr === "::") return true;
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  const first = addr.split(":")[0];
  if (/^f[cd]/.test(first)) return true; // fc00::/7 ULA
  if (/^fe[89ab]/.test(first)) return true; // fe80::/10 link-local
  if (/^ff/.test(first)) return true; // ff00::/8 multicast
  return false;
}

function isPrivateIp(ip: string): boolean {
  const fam = net.isIP(ip);
  if (fam === 4) return isPrivateIPv4(ip);
  if (fam === 6) return isPrivateIPv6(ip);
  return true; // kein gültiges IP-Literal → als unsicher behandeln
}

/** Wirft SsrfError, wenn das Ziel kein öffentliches http(s)-Ziel ist. */
export async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfError(`Ungültige URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfError(`Protokoll nicht erlaubt: ${url.protocol}`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, ""); // IPv6-Klammern entfernen
  if (!host || host.toLowerCase() === "localhost") {
    throw new SsrfError(`Host nicht erlaubt: ${host || "(leer)"}`);
  }
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new SsrfError(`DNS-Auflösung fehlgeschlagen: ${host}`);
  }
  for (const a of addrs) {
    if (isPrivateIp(a.address)) {
      throw new SsrfError(`Private/interne Adresse blockiert: ${host} → ${a.address}`);
    }
  }
  return url;
}

/**
 * Wie fetch(), aber blockt interne Ziele und re-validiert jeden Redirect-Hop.
 * Alle Aufrufer nutzen GET; Redirects werden als GET gefolgt.
 */
export async function safeFetch(input: string, init: RequestInit = {}): Promise<Response> {
  let current = input;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await assertSafeUrl(current);
    const res = await fetch(current, { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400 && res.headers.has("location")) {
      const location = res.headers.get("location")!;
      current = new URL(location, current).toString();
      continue;
    }
    return res;
  }
  throw new SsrfError(`Zu viele Redirects (>${MAX_REDIRECTS})`);
}
