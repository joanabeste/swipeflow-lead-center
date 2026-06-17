import { NextResponse, type NextRequest } from "next/server";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createClient } from "@/lib/supabase/server";

// Node-Runtime nötig (DNS-Lookup für SSRF-Guard, undici-Fetch). Genug Zeit für
// langsame externe Seiten.
export const runtime = "nodejs";
export const maxDuration = 30;

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * Reverse-Proxy für die Live-Ansicht im Qualifizierungs-Cockpit.
 *
 * Holt eine externe Seite, entfernt deren Einbett-Sperren (X-Frame-Options /
 * CSP) und liefert das HTML same-origin zurück, damit das iframe Seiten anzeigen
 * kann, die direktes Einbetten verbieten. Assets laden weiter direkt von der
 * Ziel-Origin (per injiziertem <base>), Klick-Navigation bleibt im Proxy (per
 * injiziertem Skript).
 *
 * Sicherheit: nur eingeloggte Nutzer; SSRF-Guard gegen interne Adressen;
 * set-cookie wird verworfen; der Aufrufer rendert das Ergebnis in einem iframe
 * OHNE allow-same-origin (null-Origin → kein Zugriff auf unsere Cookies/Storage).
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = request.nextUrl.searchParams.get("url");
  if (!raw) return NextResponse.json({ error: "url fehlt" }, { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Ungültige URL" }, { status: 400 });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return NextResponse.json({ error: "Nur http/https" }, { status: 400 });
  }
  if (await isBlockedHost(target.hostname)) {
    return NextResponse.json({ error: "Interne Adressen sind nicht erlaubt" }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(target.href, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
    });
  } catch {
    return errorPage("Die Seite konnte nicht geladen werden (Timeout oder nicht erreichbar).");
  }

  const contentType = res.headers.get("content-type") ?? "text/html; charset=utf-8";
  const buf = Buffer.from(await res.arrayBuffer());

  // Nicht-HTML (selten beim Top-Level) unverändert durchreichen.
  if (!/text\/html|application\/xhtml/i.test(contentType)) {
    return new NextResponse(buf, {
      status: res.status,
      headers: { "Content-Type": contentType, "Cache-Control": "no-store" },
    });
  }

  const proxyBase = `${request.nextUrl.origin}/api/site-proxy?url=`;
  const html = rewriteHtml(buf.toString("utf-8"), res.url || target.href, proxyBase);

  // Bewusst frische, minimale Header — Sperr-/Cookie-Header der Zielseite werden
  // dadurch NICHT weitergereicht.
  return new NextResponse(html, {
    status: res.status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// ─── HTML-Rewrite ───────────────────────────────────────────────────────

function rewriteHtml(html: string, baseUrl: string, proxyBase: string): string {
  // 1) Eigene CSP-/Sperr-Meta-Tags der Seite entfernen.
  let out = html.replace(
    /<meta[^>]+http-equiv=["']?(content-security-policy|x-frame-options)["']?[^>]*>/gi,
    "",
  );

  // 2) <base> injizieren, damit relative Assets/Links gegen die Ziel-Origin
  //    auflösen — nur wenn die Seite nicht selbst eines setzt.
  if (!/<base\b/i.test(out)) {
    const baseTag = `<base href="${escapeAttr(baseUrl)}">`;
    out = /<head[^>]*>/i.test(out)
      ? out.replace(/<head[^>]*>/i, (m) => `${m}${baseTag}`)
      : `${baseTag}${out}`;
  }

  // 3) Navigations-Skript injizieren: a[href] werden auf den Proxy umgebogen,
  //    sodass Klicks im Proxy bleiben (auch dynamisch nachgeladene Links).
  const navScript = `<script>(function(){var P=${JSON.stringify(proxyBase)};function abs(h){try{return new URL(h,document.baseURI).href}catch(e){return null}}function rw(){var a=document.querySelectorAll('a[href]:not([data-px])');for(var i=0;i<a.length;i++){var el=a[i],h=abs(el.getAttribute('href'));if(h&&/^https?:/i.test(h)){el.setAttribute('data-px','1');el.href=P+encodeURIComponent(h);el.removeAttribute('target')}}}rw();try{new MutationObserver(rw).observe(document.documentElement,{subtree:true,childList:true})}catch(e){}})();</script>`;
  out = /<\/body>/i.test(out) ? out.replace(/<\/body>/i, `${navScript}</body>`) : `${out}${navScript}`;

  return out;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function errorPage(message: string): NextResponse {
  const html = `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#444;background:#f3f4f6;text-align:center;padding:24px"><p>${escapeHtml(
    message,
  )}</p></body>`;
  return new NextResponse(html, {
    status: 502,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

// ─── SSRF-Guard ─────────────────────────────────────────────────────────

/** true = Host zeigt auf eine interne/private Adresse → nicht proxen. */
async function isBlockedHost(hostname: string): Promise<boolean> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0") return true;

  // Ist der Host bereits eine IP? Sonst alle aufgelösten Adressen prüfen
  // (mildert DNS-Rebinding auf interne Ziele).
  const literal = isIP(host);
  let ips: string[];
  if (literal) {
    ips = [host];
  } else {
    try {
      const records = await lookup(host, { all: true });
      ips = records.map((r) => r.address);
    } catch {
      return true; // nicht auflösbar → blocken
    }
  }
  return ips.some(isPrivateIp);
}

function isPrivateIp(ip: string): boolean {
  // IPv4-mapped IPv6 (::ffff:1.2.3.4) → den v4-Teil prüfen.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  const addr = mapped ? mapped[1] : ip;

  if (isIP(addr) === 4) {
    const p = addr.split(".").map(Number);
    if (p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b] = p;
    if (a === 0 || a === 10 || a === 127) return true; // this-net / private / loopback
    if (a === 169 && b === 254) return true; // link-local (inkl. 169.254.169.254 Metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  // IPv6
  const v6 = ip.toLowerCase();
  if (v6 === "::1" || v6 === "::") return true; // loopback / unspecified
  if (v6.startsWith("fe80")) return true; // link-local
  if (/^f[cd][0-9a-f]{2}:/.test(v6)) return true; // unique local (fc00::/7)
  return false;
}
