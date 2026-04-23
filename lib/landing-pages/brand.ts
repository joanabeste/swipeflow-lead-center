/**
 * Corporate-Identity-Extraktor: zieht Primärfarbe + Logo-URL aus der
 * Website eines Leads. Defensiver HTML-Parser ohne externe Dependencies.
 *
 * Quellen (in Reihenfolge der Priorität):
 *   - <meta name="theme-color" content="#hex">
 *   - <meta name="msapplication-TileColor" content="#hex">
 *   - <link rel="apple-touch-icon" href="…">   (Logo)
 *   - <link rel="icon" …>                       (Logo-Fallback)
 *   - OpenGraph <meta property="og:image">     (Logo-Fallback 2)
 *   - Google S2 Favicon-Service                 (letzter Logo-Fallback)
 */

const FETCH_TIMEOUT_MS = 6000;

export interface BrandInfo {
  primaryColor: string | null;
  logoUrl: string | null;
}

export async function extractBrandFromWebsite(
  websiteOrDomain: string,
): Promise<BrandInfo> {
  const baseUrl = normalizeToUrl(websiteOrDomain);
  if (!baseUrl) return { primaryColor: null, logoUrl: null };

  const html = await fetchHtml(baseUrl);
  const fallbackLogo = googleFaviconFallback(baseUrl);
  if (!html) {
    return { primaryColor: null, logoUrl: fallbackLogo };
  }

  const head = html.slice(0, Math.min(html.length, 150_000));
  const primaryColor = extractColor(head);
  const logoUrl = extractLogo(head, baseUrl) ?? fallbackLogo;

  return { primaryColor, logoUrl };
}

function normalizeToUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme);
  } catch {
    return null;
  }
}

async function fetchHtml(url: URL): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SwipeflowLeadCenter/1.0; +https://swipeflow.de)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    }).catch(() => null);
    clearTimeout(timer);
    if (!res || !res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/.test(ct)) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractColor(head: string): string | null {
  const patterns: RegExp[] = [
    /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i,
    /<meta[^>]+name=["']msapplication-TileColor["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']msapplication-TileColor["']/i,
  ];
  for (const re of patterns) {
    const m = re.exec(head);
    if (m && m[1]) {
      const hex = normalizeHex(m[1]);
      if (hex) return hex;
    }
  }
  return null;
}

function normalizeHex(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(v)) {
    // Expand #rgb → #rrggbb, damit die Farbe im DB-Feld kanonisch liegt.
    if (v.length === 4) {
      return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
    }
    return v;
  }
  // rgb(12,34,56) akzeptieren
  const rgb = /^rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(v);
  if (rgb) {
    const [, r, g, b] = rgb;
    return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
  }
  return null;
}

function toHexByte(n: string): string {
  const v = Math.max(0, Math.min(255, Number(n)));
  return v.toString(16).padStart(2, "0");
}

function extractLogo(head: string, baseUrl: URL): string | null {
  // Apple-Touch-Icon bevorzugt (hochaufgelöst), dann icon, dann og:image.
  const patterns: RegExp[] = [
    /<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*apple-touch-icon[^"']*["']/i,
    /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
  ];
  for (const re of patterns) {
    const m = re.exec(head);
    if (m && m[1]) {
      const abs = toAbsoluteUrl(m[1], baseUrl);
      if (abs) return abs;
    }
  }
  return null;
}

function toAbsoluteUrl(href: string, baseUrl: URL): string | null {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function googleFaviconFallback(baseUrl: URL): string {
  // Google S2 liefert zuverlässig ein Favicon. 128px ist scharf genug für
  // unser kleines Logo oben auf der Landing-Page.
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(baseUrl.hostname)}&sz=128`;
}
